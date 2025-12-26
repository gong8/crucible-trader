/**
 * Tests for permutation testing functionality
 */

import test from "node:test";
import assert from "node:assert/strict";
import { runPermutationTest, interpretPermutationTest } from "../src/permutation.js";
import type { EquityPoint, Trade, PermutationTestConfig } from "../src/types.js";

test("runPermutationTest returns valid structure", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 101000 },
    { time: "2024-01-03", equity: 102000 },
    { time: "2024-01-04", equity: 103000 },
  ];

  const trades: Trade[] = [
    { time: "2024-01-02", side: "buy", price: 100, qty: 100, pnl: 1000 },
    { time: "2024-01-03", side: "sell", price: 110, qty: 100, pnl: 1000 },
    { time: "2024-01-04", side: "buy", price: 105, qty: 100, pnl: 1000 },
  ];

  const config: PermutationTestConfig = {
    iterations: 100,
    metric: "sharpe",
    seed: 42,
    alpha: 0.05,
  };

  const result = runPermutationTest(equityPoints, trades, 100000, config);

  assert.ok(result.testId);
  assert.equal(typeof result.originalMetric, "number");
  assert.equal(typeof result.pValue, "number");
  assert.ok(result.pValue >= 0 && result.pValue <= 1);
  assert.equal(typeof result.isSignificant, "boolean");
  assert.equal(result.alpha, 0.05);
  assert.equal(result.nullDistribution.length, 100);
  assert.equal(typeof result.nullMean, "number");
  assert.equal(typeof result.nullStdDev, "number");
  assert.equal(typeof result.zScore, "number");
});

test("runPermutationTest is reproducible with same seed", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 102000 },
    { time: "2024-01-03", equity: 101000 },
    { time: "2024-01-04", equity: 103000 },
  ];

  const trades: Trade[] = [
    { time: "2024-01-02", side: "buy", price: 100, qty: 100, pnl: 2000 },
    { time: "2024-01-03", side: "sell", price: 90, qty: 100, pnl: -1000 },
    { time: "2024-01-04", side: "buy", price: 105, qty: 100, pnl: 2000 },
  ];

  const config: PermutationTestConfig = {
    iterations: 50,
    metric: "total_return",
    seed: 12345,
  };

  const result1 = runPermutationTest(equityPoints, trades, 100000, config);
  const result2 = runPermutationTest(equityPoints, trades, 100000, config);

  assert.equal(result1.pValue, result2.pValue);
  assert.equal(result1.nullMean, result2.nullMean);
  assert.equal(result1.nullStdDev, result2.nullStdDev);
  assert.deepEqual(result1.nullDistribution, result2.nullDistribution);
});

test("runPermutationTest handles profitable strategy", () => {
  // Create a very profitable equity curve
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 110000 },
    { time: "2024-01-03", equity: 120000 },
    { time: "2024-01-04", equity: 130000 },
    { time: "2024-01-05", equity: 140000 },
  ];

  const trades: Trade[] = [
    { time: "2024-01-02", side: "buy", price: 100, qty: 100, pnl: 10000 },
    { time: "2024-01-03", side: "sell", price: 110, qty: 100, pnl: 10000 },
    { time: "2024-01-04", side: "buy", price: 105, qty: 100, pnl: 10000 },
    { time: "2024-01-05", side: "sell", price: 115, qty: 100, pnl: 10000 },
  ];

  const config: PermutationTestConfig = {
    iterations: 100,
    metric: "total_return",
    seed: 42,
  };

  const result = runPermutationTest(equityPoints, trades, 100000, config);

  // Original should be 0.4 (40% return)
  assert.ok(Math.abs(result.originalMetric - 0.4) < 0.01);
  // With all positive trades, p-value should be very low (significant)
  assert.ok(result.pValue <= 0.05);
  assert.equal(result.isSignificant, true);
});

test("runPermutationTest handles losing strategy", () => {
  // Create a losing equity curve
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 95000 },
    { time: "2024-01-03", equity: 90000 },
    { time: "2024-01-04", equity: 85000 },
  ];

  const trades: Trade[] = [
    { time: "2024-01-02", side: "buy", price: 100, qty: 100, pnl: -5000 },
    { time: "2024-01-03", side: "sell", price: 90, qty: 100, pnl: -5000 },
    { time: "2024-01-04", side: "buy", price: 95, qty: 100, pnl: -5000 },
  ];

  const config: PermutationTestConfig = {
    iterations: 100,
    metric: "total_return",
    seed: 42,
  };

  const result = runPermutationTest(equityPoints, trades, 100000, config);

  // Original should be -0.15 (15% loss)
  assert.ok(Math.abs(result.originalMetric - -0.15) < 0.01);
  // With consistent losses, any ordering gives similar results
  // p-value should be high (not significant)
  assert.ok(result.pValue > 0.05);
  assert.equal(result.isSignificant, false);
});

test("runPermutationTest handles max drawdown metric", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 105000 },
    { time: "2024-01-03", equity: 95000 },
    { time: "2024-01-04", equity: 100000 },
  ];

  const trades: Trade[] = [
    { time: "2024-01-02", side: "buy", price: 100, qty: 100, pnl: 5000 },
    { time: "2024-01-03", side: "sell", price: 90, qty: 100, pnl: -10000 },
    { time: "2024-01-04", side: "buy", price: 95, qty: 100, pnl: 5000 },
  ];

  const config: PermutationTestConfig = {
    iterations: 50,
    metric: "max_dd",
    seed: 42,
  };

  const result = runPermutationTest(equityPoints, trades, 100000, config);

  // Should calculate max drawdown correctly
  assert.ok(result.originalMetric < 0); // Drawdown is negative
  assert.equal(typeof result.pValue, "number");
  assert.ok(result.pValue >= 0 && result.pValue <= 1);
});

test("runPermutationTest handles mixed wins and losses", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 105000 },
    { time: "2024-01-03", equity: 103000 },
    { time: "2024-01-04", equity: 108000 },
    { time: "2024-01-05", equity: 106000 },
  ];

  const trades: Trade[] = [
    { time: "2024-01-02", side: "buy", price: 100, qty: 100, pnl: 5000 },
    { time: "2024-01-03", side: "sell", price: 98, qty: 100, pnl: -2000 },
    { time: "2024-01-04", side: "buy", price: 105, qty: 100, pnl: 5000 },
    { time: "2024-01-05", side: "sell", price: 103, qty: 100, pnl: -2000 },
  ];

  const config: PermutationTestConfig = {
    iterations: 100,
    metric: "sharpe",
    seed: 42,
  };

  const result = runPermutationTest(equityPoints, trades, 100000, config);

  // Should have reasonable Sharpe ratio
  assert.equal(typeof result.originalMetric, "number");
  // Null distribution should have variance
  assert.ok(result.nullStdDev > 0);
});

test("interpretPermutationTest produces readable output for significant result", () => {
  const result = {
    testId: "test-123",
    originalMetric: 1.5,
    pValue: 0.02,
    isSignificant: true,
    alpha: 0.05,
    nullDistribution: [0.1, 0.2, 0.3],
    nullMean: 0.2,
    nullStdDev: 0.1,
    zScore: 2.5,
  };

  const interpretation = interpretPermutationTest(result);

  assert.ok(interpretation.includes("statistically significant"));
  assert.ok(interpretation.includes("0.0200"));
  assert.ok(interpretation.includes("unlikely to have occurred by chance"));
});

test("interpretPermutationTest produces readable output for non-significant result", () => {
  const result = {
    testId: "test-123",
    originalMetric: 0.3,
    pValue: 0.45,
    isSignificant: false,
    alpha: 0.05,
    nullDistribution: [0.1, 0.2, 0.3],
    nullMean: 0.25,
    nullStdDev: 0.15,
    zScore: 0.33,
  };

  const interpretation = interpretPermutationTest(result);

  assert.ok(interpretation.includes("NOT statistically significant"));
  assert.ok(interpretation.includes("0.4500"));
  assert.ok(interpretation.includes("could plausibly have occurred by chance"));
});

test("runPermutationTest defaults alpha to 0.05 when not provided", () => {
  const equityPoints: EquityPoint[] = [
    { time: "2024-01-01", equity: 100000 },
    { time: "2024-01-02", equity: 101000 },
  ];

  const trades: Trade[] = [{ time: "2024-01-02", side: "buy", price: 100, qty: 100, pnl: 1000 }];

  const config: PermutationTestConfig = {
    iterations: 10,
    metric: "sharpe",
    seed: 42,
    // alpha not provided
  };

  const result = runPermutationTest(equityPoints, trades, 100000, config);

  assert.equal(result.alpha, 0.05);
});
