import assert from "node:assert/strict";
import test from "node:test";

import type { BacktestResult } from "@crucible-trader/sdk";

const loadDatabase = async () => {
  try {
    const module = await import("./index.js");
    return module.createApiDatabase;
  } catch (error) {
    console.error("failed to import createApiDatabase", error);
    throw error;
  }
};

test("insertRun persists metadata and listRuns returns it", async (t) => {
  const createApiDatabase = await loadDatabase();
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const createdAt = new Date().toISOString();
  await db.insertRun({
    runId: "run-1",
    name: "Sample Run",
    createdAt,
    status: "queued",
    requestJson: JSON.stringify({ runName: "Sample Run" }),
  });

  const runs = await db.listRuns();
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], {
    runId: "run-1",
    name: "Sample Run",
    createdAt,
    status: "queued",
  });
});

test("saveRunResult stores summary and artifacts for later retrieval", async (t) => {
  const createApiDatabase = await loadDatabase();
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const createdAt = new Date().toISOString();
  await db.insertRun({
    runId: "run-2",
    name: "Result Run",
    createdAt,
    status: "queued",
    requestJson: JSON.stringify({ runName: "Result Run" }),
  });

  const result: BacktestResult = {
    runId: "run-2",
    summary: { sharpe: 1.2, cagr: 0.15 },
    artifacts: {
      equityParquet: "storage/runs/run-2/equity.parquet",
      tradesParquet: "storage/runs/run-2/trades.parquet",
      barsParquet: "storage/runs/run-2/bars.parquet",
      reportMd: "storage/runs/run-2/report.md",
    },
    diagnostics: { engineVersion: "0.0.1" },
  };

  await db.saveRunResult(result);

  const run = await db.getRun("run-2");
  assert(run, "run should exist after saving result");
  assert.equal(run?.status, "completed");
  assert(run?.summaryJson, "summary_json should be populated");
  assert.deepEqual(JSON.parse(run?.summaryJson ?? "{}"), result.summary);

  const artifacts = await db.getArtifacts("run-2");
  assert.equal(artifacts.length, 4);
  const kinds = artifacts.map((artifact) => artifact.kind).sort();
  assert.deepEqual(kinds, ["bars", "equity", "report", "trades"]);
  const report = artifacts.find((artifact) => artifact.kind === "report");
  assert(report);
  assert.equal(report?.path, "storage/runs/run-2/report.md");
});
