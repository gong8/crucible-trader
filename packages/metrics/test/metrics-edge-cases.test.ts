import { strict as assert } from "node:assert";
import test from "node:test";

import {
  calculateReturns,
  calculateSharpe,
  calculateSortino,
  calculateMaxDrawdown,
  calculateCagr,
  calculateMetricsSummary,
  type EquityPoint,
} from "../src/index.js";

// ============================================================================
// Extreme Value Tests - Potential Overflow/Underflow
// ============================================================================

test("calculateReturns handles extremely large equity values", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: Number.MAX_SAFE_INTEGER },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: Number.MAX_SAFE_INTEGER - 1000000 },
  ];

  const returns = calculateReturns(points);
  assert.equal(returns.length, 1);
  assert.ok(Number.isFinite(returns[0]!));
});

test("calculateReturns handles very small equity values", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 0.00001 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 0.00002 },
  ];

  const returns = calculateReturns(points);
  assert.equal(returns.length, 1);
  // 100% return (doubling)
  assert.ok(Math.abs(returns[0]! - 1.0) < 1e-6);
});

test("calculateReturns handles equity values near zero", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 0.0001 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 0.0002 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 0.0001 },
  ];

  const returns = calculateReturns(points);
  assert.equal(returns.length, 2);
  assert.ok(Number.isFinite(returns[0]!));
  assert.ok(Number.isFinite(returns[1]!));
});

test("calculateReturns handles equity transitioning through zero", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 0 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 100 },
  ];

  const returns = calculateReturns(points);
  // First return: -100% (0 / 100 - 1 = -1)
  // Second return: skip (previous equity <= 0)
  assert.equal(returns.length, 1);
  assert.equal(returns[0], -1);
});

test("calculateReturns handles sustained zero equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 0 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 0 },
  ];

  const returns = calculateReturns(points);
  // All should be skipped due to previous equity <= 0
  assert.equal(returns.length, 0);
});

test("calculateReturns handles recovery from zero equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 0 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 50 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 100 },
  ];

  const returns = calculateReturns(points);
  // Day 1->2: -100%
  // Day 2->3: skipped (prev=0)
  // Day 3->4: 100% gain
  assert.equal(returns.length, 2);
  assert.equal(returns[0], -1);
  assert.equal(returns[1], 1);
});

// ============================================================================
// Sharpe Ratio - Division by Zero and Numerical Stability
// ============================================================================

test("calculateSharpe handles all-zero returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 100000 },
  ];

  const sharpe = calculateSharpe(points);
  // Std dev is 0, so Sharpe should be 0
  assert.equal(sharpe, 0);
});

test("calculateSharpe handles tiny positive variance", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000.0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100000.01 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 100000.02 },
  ];

  const sharpe = calculateSharpe(points);
  // Should not divide by zero or produce Infinity
  assert.ok(Number.isFinite(sharpe));
});

test("calculateSharpe handles extremely volatile returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 200000 }, // +100%
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 100000 }, // -50%
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 200000 }, // +100%
    { timestamp: "2024-01-05T00:00:00.000Z", equity: 100000 }, // -50%
  ];

  const sharpe = calculateSharpe(points);
  assert.ok(Number.isFinite(sharpe));
  // High volatility should result in low Sharpe despite mean return
});

test("calculateSharpe handles negative average returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 99000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 98000 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 97000 },
  ];

  const sharpe = calculateSharpe(points);
  assert.ok(Number.isFinite(sharpe));
  assert.ok(sharpe < 0); // Negative Sharpe for negative returns
});

test("calculateSharpe handles single large gain followed by flat", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 110000 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 110000 },
  ];

  const sharpe = calculateSharpe(points);
  assert.ok(Number.isFinite(sharpe));
  // Should handle mixed zero and non-zero returns
});

// ============================================================================
// Sortino Ratio - Downside Deviation Edge Cases
// ============================================================================

test("calculateSortino handles all positive returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 101000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 102000 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 103000 },
  ];

  const sortino = calculateSortino(points);
  // No negative returns, so downside deviation is 0
  // Sortino should be 0 (division by zero case)
  assert.equal(sortino, 0);
});

test("calculateSortino handles all negative returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 99000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 98000 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 97000 },
  ];

  const sortino = calculateSortino(points);
  assert.ok(Number.isFinite(sortino));
  assert.ok(sortino < 0); // Negative Sortino for negative returns
});

test("calculateSortino handles mixed returns with one large loss", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 101000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 90000 }, // Large loss
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 91000 },
  ];

  const sortino = calculateSortino(points);
  assert.ok(Number.isFinite(sortino));
  // Large downside deviation should lower Sortino
});

test("calculateSortino handles tiny negative returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000.0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100000.001 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 99999.999 }, // Tiny loss
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 100000.001 },
  ];

  const sortino = calculateSortino(points);
  assert.ok(Number.isFinite(sortino));
});

// ============================================================================
// Max Drawdown - Pathological Equity Curves
// ============================================================================

test("calculateMaxDrawdown handles constant equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 100000 },
  ];

  const maxDD = calculateMaxDrawdown(points);
  assert.equal(maxDD, 0);
});

test("calculateMaxDrawdown handles only increasing equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 120000 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 130000 },
  ];

  const maxDD = calculateMaxDrawdown(points);
  assert.equal(maxDD, 0);
});

test("calculateMaxDrawdown handles total wipeout", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 50000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 0 },
  ];

  const maxDD = calculateMaxDrawdown(points);
  // -100% drawdown
  assert.equal(maxDD, -1.0);
});

test("calculateMaxDrawdown handles multiple drawdown periods", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 90000 }, // -10%
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 95000 }, // Recovery
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 100000 }, // New high
    { timestamp: "2024-01-05T00:00:00.000Z", equity: 80000 }, // -20% (worst)
    { timestamp: "2024-01-06T00:00:00.000Z", equity: 90000 },
  ];

  const maxDD = calculateMaxDrawdown(points);
  // Max DD should be -20% (100k -> 80k)
  assert.ok(Math.abs(maxDD - -0.2) < 1e-6);
});

test("calculateMaxDrawdown handles drawdown at the end", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 120000 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 80000 }, // End in drawdown
  ];

  const maxDD = calculateMaxDrawdown(points);
  // (80k - 120k) / 120k = -33.33%
  assert.ok(Math.abs(maxDD - -1 / 3) < 1e-6);
});

test("calculateMaxDrawdown handles recovery to new high", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 50000 }, // -50%
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 75000 }, // Partial recovery
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 150000 }, // New high!
  ];

  const maxDD = calculateMaxDrawdown(points);
  // Max DD is -50% even though we recovered
  assert.equal(maxDD, -0.5);
});

test("calculateMaxDrawdown handles near-zero equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 1.0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 0.1 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 0.01 },
  ];

  const maxDD = calculateMaxDrawdown(points);
  // (0.01 - 1.0) / 1.0 = -0.99
  assert.ok(Math.abs(maxDD - -0.99) < 1e-6);
});

// ============================================================================
// CAGR - Time Period Edge Cases
// ============================================================================

test("calculateCagr handles exactly one year", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2025-01-01T00:00:00.000Z", equity: 110000 },
  ];

  const cagr = calculateCagr(points);
  // 10% over 1 year = 10% CAGR
  assert.ok(Math.abs(cagr - 0.1) < 1e-6);
});

test("calculateCagr handles less than one year", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-07-01T00:00:00.000Z", equity: 105000 }, // 6 months
  ];

  const cagr = calculateCagr(points);
  // 5% over 0.5 years should annualize to ~10.25%
  assert.ok(Number.isFinite(cagr));
  assert.ok(cagr > 0.1 && cagr < 0.11);
});

test("calculateCagr handles multiple years", () => {
  const points: EquityPoint[] = [
    { timestamp: "2020-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2025-01-01T00:00:00.000Z", equity: 161051 }, // 5 years, ~10% CAGR
  ];

  const cagr = calculateCagr(points);
  assert.ok(Math.abs(cagr - 0.1) < 1e-2);
});

test("calculateCagr handles very short time period (hours)", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-01T01:00:00.000Z", equity: 100100 }, // 1 hour
  ];

  const cagr = calculateCagr(points);
  // 0.1% gain over 1/8760 years should annualize to huge number
  assert.ok(Number.isFinite(cagr));
  assert.ok(cagr > 0); // Should be positive but very large
});

test("calculateCagr handles negative returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2025-01-01T00:00:00.000Z", equity: 90000 }, // -10% over 1 year
  ];

  const cagr = calculateCagr(points);
  assert.ok(Math.abs(cagr - -0.1) < 1e-6);
});

test("calculateCagr handles total loss", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2025-01-01T00:00:00.000Z", equity: 0 },
  ];

  const cagr = calculateCagr(points);
  // -100% CAGR
  assert.equal(cagr, -1);
});

test("calculateCagr handles zero initial equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 0 },
    { timestamp: "2025-01-01T00:00:00.000Z", equity: 100000 },
  ];

  const cagr = calculateCagr(points);
  // Division by zero case - should return 0 or Infinity
  assert.ok(!Number.isNaN(cagr));
});

test("calculateCagr handles same timestamp (zero duration)", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 110000 },
  ];

  const cagr = calculateCagr(points);
  // Division by zero in years calculation
  assert.ok(!Number.isNaN(cagr));
});

test("calculateCagr handles leap year correctly", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 }, // 2024 is leap year
    { timestamp: "2025-01-01T00:00:00.000Z", equity: 110000 },
  ];

  const cagr = calculateCagr(points);
  // Should account for 366 days in 2024
  assert.ok(Math.abs(cagr - 0.1) < 1e-6);
});

// ============================================================================
// calculateMetricsSummary - Integration Tests
// ============================================================================

test("calculateMetricsSummary handles empty equity curve", () => {
  const result = calculateMetricsSummary([]);

  assert.equal(result.sharpe, 0);
  assert.equal(result.sortino, 0);
  assert.equal(result.maxDrawdown, 0);
  assert.equal(result.cagr, 0);
  assert.equal(result.totalReturn, 0);
});

test("calculateMetricsSummary handles single point", () => {
  const points: EquityPoint[] = [{ timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 }];

  const result = calculateMetricsSummary(points);

  assert.equal(result.sharpe, 0);
  assert.equal(result.sortino, 0);
  assert.equal(result.maxDrawdown, 0);
  assert.equal(result.cagr, 0);
  assert.equal(result.totalReturn, 0);
});

test("calculateMetricsSummary handles two points with gain", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110000 },
  ];

  const result = calculateMetricsSummary(points);

  assert.equal(result.sharpe, 0); // Not enough variance
  assert.equal(result.totalReturn, 0.1); // 10% gain
  assert.equal(result.maxDrawdown, 0); // No drawdown
  assert.ok(Number.isFinite(result.cagr));
});

test("calculateMetricsSummary handles realistic equity curve", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-02-01T00:00:00.000Z", equity: 105000 },
    { timestamp: "2024-03-01T00:00:00.000Z", equity: 103000 },
    { timestamp: "2024-04-01T00:00:00.000Z", equity: 108000 },
    { timestamp: "2024-05-01T00:00:00.000Z", equity: 110000 },
  ];

  const result = calculateMetricsSummary(points);

  assert.ok(Number.isFinite(result.sharpe));
  assert.ok(Number.isFinite(result.sortino));
  assert.ok(result.maxDrawdown < 0); // Had a drawdown
  assert.ok(result.totalReturn === 0.1); // 10% total gain
  assert.ok(Number.isFinite(result.cagr));
});

test("calculateMetricsSummary handles extreme volatility", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 200000 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 50000 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 150000 },
    { timestamp: "2024-01-05T00:00:00.000Z", equity: 25000 },
  ];

  const result = calculateMetricsSummary(points);

  // All metrics should be finite despite extreme volatility
  assert.ok(Number.isFinite(result.sharpe));
  assert.ok(Number.isFinite(result.sortino));
  assert.ok(Number.isFinite(result.maxDrawdown));
  assert.ok(Number.isFinite(result.cagr));
  assert.ok(Number.isFinite(result.totalReturn));
});

// ============================================================================
// Numerical Precision Tests
// ============================================================================

test("calculateReturns maintains precision with small percentage changes", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000.0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100000.01 }, // 0.0001% gain
  ];

  const returns = calculateReturns(points);
  assert.equal(returns.length, 1);
  // Should preserve small percentage change
  assert.ok(returns[0]! > 0);
  assert.ok(returns[0]! < 0.0001);
});

test("calculateSharpe handles extremely small standard deviation", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000.0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100000.0001 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 100000.0002 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 100000.0001 },
  ];

  const sharpe = calculateSharpe(points);
  assert.ok(Number.isFinite(sharpe));
});

test("calculateMaxDrawdown precision with very small drawdowns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100000.0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 99999.99999 }, // Tiny DD
  ];

  const maxDD = calculateMaxDrawdown(points);
  assert.ok(maxDD < 0);
  assert.ok(maxDD > -0.000001);
});
