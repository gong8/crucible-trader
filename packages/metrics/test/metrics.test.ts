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

test("calculateReturns computes sequential percentage returns", () => {
  const returns = calculateReturns(samplePoints);
  assert.equal(returns.length, 3);
  assert.ok(Math.abs(returns[0] - 0.01) < 1e-6);
  assert.ok(Math.abs(returns[1] + 0.014851) < 1e-4);
});

test("calculateSharpe returns zero when variance is zero", () => {
  const sharpe = calculateSharpe(samplePoints.slice(0, 2));
  assert.equal(sharpe, 0);
});

test("calculateSortino accounts for downside deviation", () => {
  const sortino = calculateSortino(samplePoints);
  assert.ok(sortino > 0);
});

test("calculateMaxDrawdown identifies largest drop", () => {
  const maxDrawdown = calculateMaxDrawdown(samplePoints);
  assert.ok(maxDrawdown < 0);
  assert.ok(Math.abs(maxDrawdown - -0.014851) < 1e-4);
});

test("calculateCagr handles chronological data", () => {
  const cagr = calculateCagr(samplePoints);
  assert.ok(Number.isFinite(cagr));
});

test("calculateMetricsSummary aggregates metrics", () => {
  const summary = calculateMetricsSummary(samplePoints);
  assert.ok(Object.keys(summary).length === 4);
  assert.ok(summary.sharpe >= 0);
});
