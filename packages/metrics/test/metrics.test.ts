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

const samplePoints: EquityPoint[] = [
  { timestamp: "2024-01-01T00:00:00.000Z", equity: 100_000 },
  { timestamp: "2024-01-02T00:00:00.000Z", equity: 101_000 },
  { timestamp: "2024-01-03T00:00:00.000Z", equity: 99_500 },
  { timestamp: "2024-01-04T00:00:00.000Z", equity: 102_000 },
];

// ============================================================================
// calculateReturns tests
// ============================================================================

test("calculateReturns computes sequential percentage returns", () => {
  const returns = calculateReturns(samplePoints);
  assert.equal(returns.length, 3);
  assert.ok(Math.abs(returns[0]! - 0.01) < 1e-6);
  assert.ok(Math.abs(returns[1]! + 0.014851) < 1e-4);
});

test("calculateReturns returns empty array for empty input", () => {
  const returns = calculateReturns([]);
  assert.equal(returns.length, 0);
});

test("calculateReturns returns empty array for single point", () => {
  const returns = calculateReturns([samplePoints[0]!]);
  assert.equal(returns.length, 0);
});

test("calculateReturns handles equity of zero gracefully", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100 },
  ];
  const returns = calculateReturns(points);
  // Should skip when previous equity is <= 0
  assert.equal(returns.length, 0);
});

test("calculateReturns handles negative equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: -100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100 },
  ];
  const returns = calculateReturns(points);
  assert.equal(returns.length, 0);
});

test("calculateReturns computes returns for all positive equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 121 },
  ];
  const returns = calculateReturns(points);
  assert.equal(returns.length, 2);
  assert.ok(Math.abs(returns[0]! - 0.1) < 1e-6);
  assert.ok(Math.abs(returns[1]! - 0.1) < 1e-6);
});

test("calculateReturns handles flat equity curve", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 100 },
  ];
  const returns = calculateReturns(points);
  assert.equal(returns.length, 2);
  assert.equal(returns[0], 0);
  assert.equal(returns[1], 0);
});

// ============================================================================
// calculateSharpe tests
// ============================================================================

test("calculateSharpe returns zero when variance is zero", () => {
  const sharpe = calculateSharpe(samplePoints.slice(0, 2));
  assert.equal(sharpe, 0);
});

test("calculateSharpe returns zero for empty points", () => {
  const sharpe = calculateSharpe([]);
  assert.equal(sharpe, 0);
});

test("calculateSharpe returns zero for single point", () => {
  const sharpe = calculateSharpe([samplePoints[0]!]);
  assert.equal(sharpe, 0);
});

test("calculateSharpe computes value for increasing equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 121 },
  ];
  const sharpe = calculateSharpe(points);
  // With only 2 returns and constant growth rate, std dev is 0, so Sharpe is 0
  // This is mathematically correct - need more variance for non-zero Sharpe
  assert.equal(sharpe, 0);
});

test("calculateSharpe handles flat equity curve", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 100 },
  ];
  const sharpe = calculateSharpe(points);
  assert.equal(sharpe, 0);
});

test("calculateSharpe with custom risk-free rate", () => {
  const sharpe = calculateSharpe(samplePoints, 0.05);
  assert.ok(Number.isFinite(sharpe));
});

test("calculateSharpe handles volatile equity curve", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 120 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 80 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 110 },
  ];
  const sharpe = calculateSharpe(points);
  assert.ok(Number.isFinite(sharpe));
});

// ============================================================================
// calculateSortino tests
// ============================================================================

test("calculateSortino accounts for downside deviation", () => {
  const sortino = calculateSortino(samplePoints);
  assert.ok(sortino > 0);
});

test("calculateSortino returns zero for empty points", () => {
  const sortino = calculateSortino([]);
  assert.equal(sortino, 0);
});

test("calculateSortino returns zero when no downside", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 121 },
  ];
  const sortino = calculateSortino(points);
  assert.equal(sortino, 0);
});

test("calculateSortino handles all negative returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 90 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 80 },
  ];
  const sortino = calculateSortino(points);
  assert.ok(sortino < 0);
});

test("calculateSortino with custom risk-free rate", () => {
  const sortino = calculateSortino(samplePoints, 0.05);
  assert.ok(Number.isFinite(sortino));
});

test("calculateSortino handles mixed positive and negative returns", () => {
  const sortino = calculateSortino(samplePoints);
  assert.ok(Number.isFinite(sortino));
  assert.ok(sortino !== 0);
});

// ============================================================================
// calculateMaxDrawdown tests
// ============================================================================

test("calculateMaxDrawdown identifies largest drop", () => {
  const maxDrawdown = calculateMaxDrawdown(samplePoints);
  assert.ok(maxDrawdown < 0);
  assert.ok(Math.abs(maxDrawdown - -0.014851) < 1e-4);
});

test("calculateMaxDrawdown returns zero for empty points", () => {
  const maxDrawdown = calculateMaxDrawdown([]);
  assert.equal(maxDrawdown, 0);
});

test("calculateMaxDrawdown returns zero for single point", () => {
  const maxDrawdown = calculateMaxDrawdown([samplePoints[0]!]);
  assert.equal(maxDrawdown, 0);
});

test("calculateMaxDrawdown returns zero for always increasing equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 121 },
  ];
  const maxDrawdown = calculateMaxDrawdown(points);
  assert.equal(maxDrawdown, 0);
});

test("calculateMaxDrawdown handles severe drawdown", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 50 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 75 },
  ];
  const maxDrawdown = calculateMaxDrawdown(points);
  assert.ok(maxDrawdown < 0);
  assert.ok(Math.abs(maxDrawdown - -0.5) < 1e-6);
});

test("calculateMaxDrawdown handles multiple drawdowns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 90 },
    { timestamp: "2024-01-03T00:00:00.000Z", equity: 95 },
    { timestamp: "2024-01-04T00:00:00.000Z", equity: 80 },
  ];
  const maxDrawdown = calculateMaxDrawdown(points);
  assert.ok(maxDrawdown < 0);
  // Max drawdown is from peak (100) to trough (80), which is -20%
  assert.ok(Math.abs(maxDrawdown - -0.2) < 1e-6);
});

test("calculateMaxDrawdown handles equity going to zero", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 0 },
  ];
  const maxDrawdown = calculateMaxDrawdown(points);
  assert.equal(maxDrawdown, -1);
});

// ============================================================================
// calculateCagr tests
// ============================================================================

test("calculateCagr handles chronological data", () => {
  const cagr = calculateCagr(samplePoints);
  assert.ok(Number.isFinite(cagr));
});

test("calculateCagr returns zero for empty points", () => {
  const cagr = calculateCagr([]);
  assert.equal(cagr, 0);
});

test("calculateCagr returns zero for single point", () => {
  const cagr = calculateCagr([samplePoints[0]!]);
  assert.equal(cagr, 0);
});

test("calculateCagr computes positive value for growth", () => {
  const points: EquityPoint[] = [
    { timestamp: "2023-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 110 },
  ];
  const cagr = calculateCagr(points);
  assert.ok(cagr > 0);
  // CAGR should be close to 10%, allowing for year fraction calculation
  assert.ok(Math.abs(cagr - 0.1) < 0.001);
});

test("calculateCagr computes negative value for loss", () => {
  const points: EquityPoint[] = [
    { timestamp: "2023-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 90 },
  ];
  const cagr = calculateCagr(points);
  assert.ok(cagr < 0);
});

test("calculateCagr handles zero starting equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2023-01-01T00:00:00.000Z", equity: 0 },
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
  ];
  const cagr = calculateCagr(points);
  assert.equal(cagr, 0);
});

test("calculateCagr handles negative equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2023-01-01T00:00:00.000Z", equity: -100 },
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
  ];
  const cagr = calculateCagr(points);
  assert.equal(cagr, 0);
});

test("calculateCagr handles invalid timestamps", () => {
  const points: EquityPoint[] = [
    { timestamp: "invalid", equity: 100 },
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 110 },
  ];
  const cagr = calculateCagr(points);
  assert.equal(cagr, 0);
});

test("calculateCagr handles same start and end time", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 110 },
  ];
  const cagr = calculateCagr(points);
  assert.equal(cagr, 0);
});

test("calculateCagr handles multi-year period", () => {
  const points: EquityPoint[] = [
    { timestamp: "2020-01-01T00:00:00.000Z", equity: 100 },
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 200 },
  ];
  const cagr = calculateCagr(points);
  assert.ok(cagr > 0);
  assert.ok(cagr < 1); // Should be less than 100% per year
});

// ============================================================================
// calculateMetricsSummary tests
// ============================================================================

test("calculateMetricsSummary aggregates metrics", () => {
  const summary = calculateMetricsSummary(samplePoints);
  assert.equal(Object.keys(summary).length, 6);
  assert.ok(summary.sharpe >= 0);
});

test("calculateMetricsSummary returns zeros for empty points", () => {
  const summary = calculateMetricsSummary([]);
  assert.equal(summary.sharpe, 0);
  assert.equal(summary.sortino, 0);
  assert.equal(summary.maxDrawdown, 0);
  assert.equal(summary.cagr, 0);
  assert.equal(summary.totalPnl, 0);
  assert.equal(summary.totalReturn, 0);
});

test("calculateMetricsSummary computes totalPnl correctly", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100_000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 105_000 },
  ];
  const summary = calculateMetricsSummary(points);
  assert.equal(summary.totalPnl, 5_000);
});

test("calculateMetricsSummary computes totalReturn correctly", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100_000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 110_000 },
  ];
  const summary = calculateMetricsSummary(points);
  assert.equal(summary.totalReturn, 0.1);
});

test("calculateMetricsSummary handles negative returns", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 100_000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 90_000 },
  ];
  const summary = calculateMetricsSummary(points);
  assert.equal(summary.totalPnl, -10_000);
  assert.equal(summary.totalReturn, -0.1);
});

test("calculateMetricsSummary handles zero starting equity", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 0 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 100 },
  ];
  const summary = calculateMetricsSummary(points);
  assert.equal(summary.totalPnl, 100);
  assert.equal(summary.totalReturn, 0);
});

test("calculateMetricsSummary all metrics are finite", () => {
  const summary = calculateMetricsSummary(samplePoints);
  assert.ok(Number.isFinite(summary.sharpe));
  assert.ok(Number.isFinite(summary.sortino));
  assert.ok(Number.isFinite(summary.maxDrawdown));
  assert.ok(Number.isFinite(summary.cagr));
  assert.ok(Number.isFinite(summary.totalPnl));
  assert.ok(Number.isFinite(summary.totalReturn));
});

test("calculateMetricsSummary handles large equity values", () => {
  const points: EquityPoint[] = [
    { timestamp: "2024-01-01T00:00:00.000Z", equity: 1_000_000_000 },
    { timestamp: "2024-01-02T00:00:00.000Z", equity: 1_100_000_000 },
  ];
  const summary = calculateMetricsSummary(points);
  assert.ok(Number.isFinite(summary.sharpe));
  assert.ok(Number.isFinite(summary.totalReturn));
});
