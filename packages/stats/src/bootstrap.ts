/**
 * Bootstrap resampling for confidence interval estimation
 *
 * Uses resampling with replacement to estimate the sampling distribution
 * of a statistic and construct confidence intervals.
 */

import { randomUUID } from "node:crypto";
import type { BootstrapConfig, BootstrapResult, EquityPoint } from "./types.js";

/**
 * Seeded random number generator for reproducible bootstrap
 */
class SeededRandom {
  private seed: number;

  public constructor(seed: number) {
    this.seed = seed;
  }

  public next(): number {
    this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
    return this.seed / 2147483648;
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }
}

/**
 * Resample an array with replacement
 */
function resampleWithReplacement<T>(array: readonly T[], rng: SeededRandom): T[] {
  const sample: T[] = [];
  for (let i = 0; i < array.length; i++) {
    const index = rng.nextInt(0, array.length);
    sample.push(array[index]!);
  }
  return sample;
}

/**
 * Calculate returns from equity values
 */
function calculateReturns(equity: readonly number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]!;
    const curr = equity[i]!;
    if (prev !== 0) {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

/**
 * Calculate Sharpe ratio from returns
 */
function calculateSharpe(returns: readonly number[], riskFreeRate = 0): number {
  if (returns.length === 0) {
    return 0;
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const excessReturn = mean - riskFreeRate;

  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return 0;
  }

  return (excessReturn / stdDev) * Math.sqrt(252);
}

/**
 * Calculate Sortino ratio from returns
 */
function calculateSortino(returns: readonly number[], riskFreeRate = 0): number {
  if (returns.length === 0) {
    return 0;
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const excessReturn = mean - riskFreeRate;

  const downside = returns.filter((r) => r < riskFreeRate);
  if (downside.length === 0) {
    return 0;
  }

  const downsideVariance =
    downside.reduce((sum, r) => sum + Math.pow(r - riskFreeRate, 2), 0) / downside.length;
  const downsideStdDev = Math.sqrt(downsideVariance);

  if (downsideStdDev === 0) {
    return 0;
  }

  return (excessReturn / downsideStdDev) * Math.sqrt(252);
}

/**
 * Calculate maximum drawdown from equity values
 */
function calculateMaxDrawdown(equity: readonly number[]): number {
  if (equity.length === 0) {
    return 0;
  }

  let maxDrawdown = 0;
  let peak = equity[0]!;

  for (const value of equity) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = (value - peak) / peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

/**
 * Calculate total return
 */
function calculateTotalReturn(equity: readonly number[]): number {
  if (equity.length < 2) {
    return 0;
  }
  const first = equity[0]!;
  const last = equity[equity.length - 1]!;
  return (last - first) / first;
}

/**
 * Calculate a metric from returns
 */
function calculateMetric(returns: readonly number[], metric: string): number {
  switch (metric) {
    case "sharpe":
      return calculateSharpe(returns);
    case "sortino":
      return calculateSortino(returns);
    case "mean_return":
      return returns.reduce((sum, r) => sum + r, 0) / returns.length;
    case "std_dev": {
      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      return Math.sqrt(variance);
    }
    default:
      throw new Error(`Unknown metric: ${metric}`);
  }
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray: readonly number[], p: number): number {
  if (sortedArray.length === 0) {
    return 0;
  }
  const index = (sortedArray.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sortedArray[lower]!;
  }

  return sortedArray[lower]! * (1 - weight) + sortedArray[upper]! * weight;
}

/**
 * Run bootstrap resampling to estimate confidence intervals
 *
 * @param equityPoints - Equity curve from backtest
 * @param config - Bootstrap configuration
 * @returns Bootstrap results with confidence intervals
 */
export function runBootstrap(
  equityPoints: readonly EquityPoint[],
  config: BootstrapConfig,
): BootstrapResult {
  const testId = randomUUID();

  // Extract equity values and calculate returns
  const equityValues = equityPoints.map((p) => p.equity);
  const returns = calculateReturns(equityValues);

  if (returns.length === 0) {
    throw new Error("Cannot run bootstrap on empty returns");
  }

  // Calculate original metric (point estimate)
  let pointEstimate: number;
  if (config.metric === "total_return") {
    pointEstimate = calculateTotalReturn(equityValues);
  } else if (config.metric === "max_dd") {
    pointEstimate = calculateMaxDrawdown(equityValues);
  } else {
    pointEstimate = calculateMetric(returns, config.metric);
  }

  // Run bootstrap iterations
  const bootstrapDistribution: number[] = [];
  const rng = new SeededRandom(config.seed);

  for (let i = 0; i < config.iterations; i++) {
    // Resample returns with replacement
    const resampledReturns = resampleWithReplacement(returns, rng);

    // Calculate metric on resampled data
    let bootstrapMetric: number;
    if (config.metric === "total_return") {
      // Reconstruct equity from resampled returns
      const resampledEquity = [equityValues[0]!];
      for (const ret of resampledReturns) {
        const prev = resampledEquity[resampledEquity.length - 1]!;
        resampledEquity.push(prev * (1 + ret));
      }
      bootstrapMetric = calculateTotalReturn(resampledEquity);
    } else if (config.metric === "max_dd") {
      // Reconstruct equity from resampled returns
      const resampledEquity = [equityValues[0]!];
      for (const ret of resampledReturns) {
        const prev = resampledEquity[resampledEquity.length - 1]!;
        resampledEquity.push(prev * (1 + ret));
      }
      bootstrapMetric = calculateMaxDrawdown(resampledEquity);
    } else {
      bootstrapMetric = calculateMetric(resampledReturns, config.metric);
    }

    bootstrapDistribution.push(bootstrapMetric);
  }

  // Sort distribution for percentile calculation
  const sortedDistribution = [...bootstrapDistribution].sort((a, b) => a - b);

  // Calculate confidence interval using percentile method
  const lowerPercentile = (1 - config.confidenceLevel) / 2;
  const upperPercentile = 1 - lowerPercentile;

  const ciLower = percentile(sortedDistribution, lowerPercentile);
  const ciUpper = percentile(sortedDistribution, upperPercentile);

  // Calculate standard error
  const mean = bootstrapDistribution.reduce((sum, v) => sum + v, 0) / bootstrapDistribution.length;
  const variance =
    bootstrapDistribution.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    bootstrapDistribution.length;
  const standardError = Math.sqrt(variance);

  return {
    testId,
    metric: config.metric,
    pointEstimate,
    ciLower,
    ciUpper,
    standardError,
    confidenceLevel: config.confidenceLevel,
    bootstrapDistribution,
  };
}

/**
 * Create a human-readable interpretation of bootstrap results
 */
export function interpretBootstrap(result: BootstrapResult): string {
  const { metric, pointEstimate, ciLower, ciUpper, confidenceLevel, standardError } = result;
  const ciPercent = (confidenceLevel * 100).toFixed(0);

  return (
    `The ${metric} has a point estimate of ${pointEstimate.toFixed(4)} ` +
    `with a ${ciPercent}% confidence interval of [${ciLower.toFixed(4)}, ${ciUpper.toFixed(4)}]. ` +
    `Standard error: ${standardError.toFixed(4)}.`
  );
}
