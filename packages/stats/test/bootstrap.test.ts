/**
 * Tests for bootstrap resampling functionality
 */

import test from "node:test";
import assert from "node:assert/strict";
import { runBootstrap, interpretBootstrap } from "../src/bootstrap.js";
import type { EquityPoint, BootstrapConfig } from "../src/types.js";

test("runBootstrap returns valid structure", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 101000 },
    { time: "2024-01-03", equity: 102000 },
    { time: "2024-01-04", equity: 103000 },
    { time: "2024-01-05", equity: 104000 },
  ];

  const config: BootstrapConfig = {
    iterations: 100,
    metric: "sharpe",
    confidenceLevel: 0.95,
    seed: 42,
  };

  const result = runBootstrap(equityPoints, config);

  assert.ok(result.testId);
  assert.equal(result.metric, "sharpe");
  assert.equal(typeof result.pointEstimate, "number");
  assert.equal(typeof result.ciLower, "number");
  assert.equal(typeof result.ciUpper, "number");
  assert.equal(typeof result.standardError, "number");
  assert.equal(result.confidenceLevel, 0.95);
  assert.equal(result.bootstrapDistribution.length, 100);
  assert.ok(result.ciLower <= result.ciUpper);
});

test("runBootstrap is reproducible with same seed", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 102000 },
    { time: "2024-01-03", equity: 103000 },
    { time: "2024-01-04", equity: 105000 },
  ];

  const config: BootstrapConfig = {
    iterations: 50,
    metric: "total_return",
    confidenceLevel: 0.95,
    seed: 12345,
  };

  const result1 = runBootstrap(equityPoints, config);
  const result2 = runBootstrap(equityPoints, config);

  assert.equal(result1.pointEstimate, result2.pointEstimate);
  assert.equal(result1.ciLower, result2.ciLower);
  assert.equal(result1.ciUpper, result2.ciUpper);
  assert.equal(result1.standardError, result2.standardError);
  assert.deepEqual(result1.bootstrapDistribution, result2.bootstrapDistribution);
});

test("runBootstrap handles sharpe ratio", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 101000 },
    { time: "2024-01-03", equity: 102000 },
    { time: "2024-01-04", equity: 103000 },
    { time: "2024-01-05", equity: 104000 },
    { time: "2024-01-06", equity: 105000 },
  ];

  const config: BootstrapConfig = {
    iterations: 100,
    metric: "sharpe",
    confidenceLevel: 0.9,
    seed: 42,
  };

  const result = runBootstrap(equityPoints, config);

  assert.equal(result.metric, "sharpe");
  assert.ok(result.pointEstimate > 0); // Should be positive for increasing equity
  assert.ok(result.ciLower < result.ciUpper);
  assert.ok(result.standardError >= 0);
});

test("runBootstrap handles sortino ratio", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 102000 },
    { time: "2024-01-03", equity: 101000 },
    { time: "2024-01-04", equity: 103000 },
    { time: "2024-01-05", equity: 104000 },
  ];

  const config: BootstrapConfig = {
    iterations: 100,
    metric: "sortino",
    confidenceLevel: 0.95,
    seed: 42,
  };

  const result = runBootstrap(equityPoints, config);

  assert.equal(result.metric, "sortino");
  assert.equal(typeof result.pointEstimate, "number");
  assert.ok(result.ciLower <= result.ciUpper);
});

test("runBootstrap handles total return", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 110000 },
    { time: "2024-01-03", equity: 120000 },
  ];

  const config: BootstrapConfig = {
    iterations: 100,
    metric: "total_return",
    confidenceLevel: 0.95,
    seed: 42,
  };

  const result = runBootstrap(equityPoints, config);

  // Point estimate should be 0.2 (20% return)
  assert.ok(Math.abs(result.pointEstimate - 0.2) < 0.01);
  assert.ok(result.ciLower <= result.pointEstimate);
  assert.ok(result.pointEstimate <= result.ciUpper);
});

test("runBootstrap handles max drawdown", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 110000 },
    { time: "2024-01-03", equity: 95000 },
    { time: "2024-01-04", equity: 105000 },
  ];

  const config: BootstrapConfig = {
    iterations: 100,
    metric: "max_dd",
    confidenceLevel: 0.95,
    seed: 42,
  };

  const result = runBootstrap(equityPoints, config);

  assert.equal(result.metric, "max_dd");
  assert.ok(result.pointEstimate < 0); // Drawdown is negative
  assert.ok(result.ciLower <= result.ciUpper);
});

test("runBootstrap confidence interval contains point estimate with high probability", () => {
  const equityPoints: EquityPoint[] = [];
  let equity = 100000;
  for (let i = 0; i < 100; i++) {
    equityPoints.push({ time: `2024-01-${i + 1}`, equity });
    equity *= 1.001; // 0.1% daily growth
  }

  const config: BootstrapConfig = {
    iterations: 500,
    metric: "mean_return",
    confidenceLevel: 0.95,
    seed: 42,
  };

  const result = runBootstrap(equityPoints, config);

  // Point estimate should be within CI
  assert.ok(result.ciLower <= result.pointEstimate);
  assert.ok(result.pointEstimate <= result.ciUpper);
});

test("runBootstrap wider confidence level produces wider intervals", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 101000 },
    { time: "2024-01-03", equity: 102000 },
    { time: "2024-01-04", equity: 103000 },
  ];

  const config90: BootstrapConfig = {
    iterations: 1000, // More iterations for better percentile resolution
    metric: "sharpe",
    confidenceLevel: 0.9,
    seed: 42,
  };

  const config95: BootstrapConfig = {
    iterations: 1000, // More iterations for better percentile resolution
    metric: "sharpe",
    confidenceLevel: 0.95,
    seed: 42,
  };

  const result90 = runBootstrap(equityPoints, config90);
  const result95 = runBootstrap(equityPoints, config95);

  const width90 = result90.ciUpper - result90.ciLower;
  const width95 = result95.ciUpper - result95.ciLower;

  // 95% CI should be wider than or equal to 90% CI
  assert.ok(width95 >= width90);
});

test("runBootstrap handles std_dev metric", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 102000 },
    { time: "2024-01-03", equity: 101000 },
    { time: "2024-01-04", equity: 103000 },
    { time: "2024-01-05", equity: 102000 },
  ];

  const config: BootstrapConfig = {
    iterations: 100,
    metric: "std_dev",
    confidenceLevel: 0.95,
    seed: 42,
  };

  const result = runBootstrap(equityPoints, config);

  assert.equal(result.metric, "std_dev");
  assert.ok(result.pointEstimate > 0); // Std dev is always positive
  assert.ok(result.ciLower >= 0);
});

test("runBootstrap throws on empty equity", () => {
  const equityPoints: EquityPoint[] = [];

  const config: BootstrapConfig = {
    iterations: 100,
    metric: "sharpe",
    confidenceLevel: 0.95,
    seed: 42,
  };

  assert.throws(() => {
    runBootstrap(equityPoints, config);
  }, /Cannot run bootstrap on empty returns/);
});

test("interpretBootstrap produces readable output", () => {
  const result = {
    testId: "test-123",
    metric: "sharpe",
    pointEstimate: 1.5,
    ciLower: 1.2,
    ciUpper: 1.8,
    standardError: 0.15,
    confidenceLevel: 0.95,
    bootstrapDistribution: [1.3, 1.4, 1.5, 1.6, 1.7],
  };

  const interpretation = interpretBootstrap(result);

  assert.ok(interpretation.includes("sharpe"));
  assert.ok(interpretation.includes("1.5000"));
  assert.ok(interpretation.includes("95%"));
  assert.ok(interpretation.includes("[1.2000, 1.8000]"));
  assert.ok(interpretation.includes("0.1500"));
});

test("interpretBootstrap handles different metrics", () => {
  const result = {
    testId: "test-123",
    metric: "total_return",
    pointEstimate: 0.25,
    ciLower: 0.15,
    ciUpper: 0.35,
    standardError: 0.05,
    confidenceLevel: 0.9,
    bootstrapDistribution: [0.2, 0.25, 0.3],
  };

  const interpretation = interpretBootstrap(result);

  assert.ok(interpretation.includes("total_return"));
  assert.ok(interpretation.includes("0.2500"));
  assert.ok(interpretation.includes("90%"));
});
