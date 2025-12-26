#!/usr/bin/env node

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

/**
 * Runs all tests and provides a comprehensive summary.
 *
 * Usage: node ops/scripts/test-with-summary.mjs
 */

const PACKAGE_ORDER = [
  "sdk",
  "logger",
  "risk",
  "report",
  "metrics",
  "data",
  "engine",
  "api",
  "backtest-worker",
  "web",
];

const results = {};
const encounteredPackages = new Set();
const completedPackages = new Set();
let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
let currentPackage = null;

const getProgressDenominator = () => Math.max(PACKAGE_ORDER.length, encounteredPackages.size);

const sortPackages = () =>
  Object.keys(results).sort((a, b) => {
    const aIndex = PACKAGE_ORDER.indexOf(a);
    const bIndex = PACKAGE_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

const ensurePackageEntry = (pkg) => {
  if (!pkg) {
    return;
  }
  encounteredPackages.add(pkg);
  if (!results[pkg]) {
    results[pkg] = { tests: 0, pass: 0, fail: 0, status: "pending" };
  }
};

const statusIconFor = (status) => {
  if (status === "fail") return "[X]";
  if (status === "skip") return "[/]";
  return "[OK]";
};

const markPackageComplete = (pkg) => {
  if (!pkg || completedPackages.has(pkg)) return;
  completedPackages.add(pkg);
  const denominator = getProgressDenominator();
  const percentage = ((completedPackages.size / denominator) * 100).toFixed(0);
  const result = results[pkg];
  const icon = statusIconFor(result.status);
  const totals = result.tests === 0 ? "no tests" : `${result.pass}/${result.tests} passed`;
  console.log(
    `\n[${completedPackages.size}/${denominator} ${percentage}%] ${icon} ${pkg} ${totals}`,
  );
};

console.log("Running all tests...\n");

const testProcess = spawn("pnpm", ["-r", "test"], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
});

let outputBuffer = "";

testProcess.stdout.on("data", (data) => {
  const text = data.toString();
  process.stdout.write(text);
  outputBuffer += text;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;

    const pnpmMatch = line.match(/>[ ]*@crucible-trader\/([a-z-]+)@.* test/);
    if (pnpmMatch) {
      currentPackage = pnpmMatch[1];
      ensurePackageEntry(currentPackage);
      continue;
    }

    const workspaceMatch = line.match(/^(?:apps|packages|services)\/([a-z-]+) test(?::|\$)/);
    if (workspaceMatch) {
      currentPackage = workspaceMatch[1];
      ensurePackageEntry(currentPackage);
    }

    const testsMatch = line.match(/tests (\d+)/);
    if (testsMatch && currentPackage) {
      results[currentPackage].tests = parseInt(testsMatch[1], 10);
    }

    const passMatch = line.match(/pass (\d+)/);
    if (passMatch && currentPackage) {
      results[currentPackage].pass = parseInt(passMatch[1], 10);
    }

    const failMatch = line.match(/fail (\d+)/);
    if (failMatch && currentPackage) {
      results[currentPackage].fail = parseInt(failMatch[1], 10);
      results[currentPackage].status = results[currentPackage].fail === 0 ? "pass" : "fail";
      markPackageComplete(currentPackage);
    }

    const noTestsMatch = line.match(/No tests yet for ([\w-]+)/);
    if (noTestsMatch) {
      const pkg = noTestsMatch[1];
      ensurePackageEntry(pkg);
      results[pkg].status = "skip";
      markPackageComplete(pkg);
    }
  }
});

testProcess.stderr.on("data", (data) => {
  process.stderr.write(data);
  outputBuffer += data.toString();
});

testProcess.on("close", (code) => {
  // Calculate totals
  for (const pkg in results) {
    totalTests += results[pkg].tests;
    totalPassed += results[pkg].pass;
    totalFailed += results[pkg].fail;
  }

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log();

  const sortedPackages = sortPackages();

  let packagesProcessed = 0;
  for (const pkg of sortedPackages) {
    const result = results[pkg];
    packagesProcessed++;
    const percentage = ((packagesProcessed / sortedPackages.length) * 100).toFixed(0);

    let statusIcon = "[OK]";
    let statusText = "PASS";
    if (result.status === "fail") {
      statusIcon = "[X]";
      statusText = "FAIL";
    } else if (result.status === "skip") {
      statusIcon = "[/]";
      statusText = "SKIP";
    }

    if (result.tests === 0) {
      console.log(
        `  [${percentage.padStart(3)}%] ${statusIcon} ${pkg.padEnd(20)} ${statusText.padEnd(6)} (no tests)`,
      );
    } else {
      const passRate = result.tests > 0 ? ((result.pass / result.tests) * 100).toFixed(0) : 0;
      console.log(
        `  [${percentage.padStart(3)}%] ${statusIcon} ${pkg.padEnd(20)} ` +
          `${result.pass.toString().padStart(2)}/${result.tests.toString().padStart(2)} ` +
          `(${passRate.toString().padStart(3)}%)`,
      );
    }
  }

  console.log();
  console.log("-".repeat(80));

  const overallPassRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;
  const allPassed = totalFailed === 0 && totalTests > 0;
  const summaryIcon = allPassed ? "[OK]" : totalFailed > 0 ? "[X]" : "[/]";

  if (allPassed) {
    console.log("All tests passing across all packages:");
  } else {
    console.log("Test results by package:");
  }
  for (const pkg of sortedPackages) {
    const result = results[pkg];
    const icon = statusIconFor(result.status);
    const line =
      result.tests === 0
        ? `no tests`
        : `${result.pass}/${result.tests} (${((result.pass / (result.tests || 1)) * 100).toFixed(
            0,
          )}%)`;
    console.log(`  - ${pkg}: ${line} ${icon}`);
  }

  console.log();
  console.log(
    `  ${summaryIcon} TOTAL: ${totalPassed}/${totalTests} tests passing (${overallPassRate}%)`,
  );

  if (totalFailed > 0) {
    console.log(`  [X] Failed: ${totalFailed} test${totalFailed !== 1 ? "s" : ""}`);
  }

  console.log("=".repeat(80));
  console.log();

  // Write detailed output to file
  writeFileSync("test-output.log", outputBuffer);
  console.log("Detailed output saved to test-output.log\n");

  // Exit with appropriate code
  process.exit(code);
});
