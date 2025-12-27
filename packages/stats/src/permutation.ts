/**
 * Permutation testing for backtest statistical validation
 *
 * Tests whether backtest results could have occurred by chance by shuffling
 * trade signals and comparing the original metric to a null distribution.
 */

import { randomUUID } from "node:crypto";
import type { PermutationTestConfig, PermutationTestResult, Trade, EquityPoint } from "./types.js";

/**
 * Seeded random number generator for reproducible permutations
 */
class SeededRandom {
  private seed: number;

  public constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Generate next random number in [0, 1)
   * Using a simple LCG (Linear Congruential Generator)
   */
  public next(): number {
    this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
    return this.seed / 2147483648;
  }

  /**
   * Generate random integer in [min, max)
   */
  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }
}

/**
 * Shuffle an array in place using Fisher-Yates algorithm
 */
function shuffle<T>(array: T[], rng: SeededRandom): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i + 1);
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
}

/**
 * Calculate a metric from equity curve
 */
function calculateMetricFromEquity(equityPoints: readonly EquityPoint[], metric: string): number {
  if (equityPoints.length === 0) {
    return 0;
  }

  const equityValues = equityPoints.map((p) => p.equity);
  const returns = calculateReturns(equityValues);

  switch (metric) {
    case "sharpe":
      return calculateSharpe(returns);
    case "sortino":
      return calculateSortino(returns);
    case "total_return": {
      const first = equityValues[0]!;
      const last = equityValues[equityValues.length - 1]!;
      return (last - first) / first;
    }
    case "max_dd":
      return calculateMaxDrawdown(equityValues);
    default:
      throw new Error(`Unknown metric: ${metric}`);
  }
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

  // Annualize assuming daily returns
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

  // Annualize assuming daily returns
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
 * Shuffle trades and recalculate equity curve
 *
 * This creates a permuted version of the backtest by randomizing
 * the order of trades while keeping individual trade P&L the same.
 */
function permuteTradesAndRecalculate(
  trades: readonly Trade[],
  initialCash: number,
  rng: SeededRandom,
): EquityPoint[] {
  // Create mutable copy of trades
  const shuffledTrades = [...trades];
  shuffle(shuffledTrades, rng);

  // Recalculate equity curve with shuffled trades
  const equityPoints: EquityPoint[] = [];
  let equity = initialCash;

  for (const trade of shuffledTrades) {
    equity += trade.pnl;
    equityPoints.push({
      time: trade.time,
      equity,
    });
  }

  return equityPoints;
}

/**
 * Run permutation test on backtest results
 *
 * @param originalEquity - Original equity curve from backtest
 * @param trades - List of trades from backtest
 * @param initialCash - Initial capital
 * @param config - Test configuration
 * @returns Permutation test results with p-value
 */
export function runPermutationTest(
  originalEquity: readonly EquityPoint[],
  trades: readonly Trade[],
  initialCash: number,
  config: PermutationTestConfig,
): PermutationTestResult {
  const testId = randomUUID();
  const alpha = config.alpha ?? 0.05;

  // Calculate original metric
  const originalMetric = calculateMetricFromEquity(originalEquity, config.metric);

  // Run permutations
  const nullDistribution: number[] = [];
  const rng = new SeededRandom(config.seed);

  for (let i = 0; i < config.iterations; i++) {
    const permutedEquity = permuteTradesAndRecalculate(trades, initialCash, rng);
    const permutedMetric = calculateMetricFromEquity(permutedEquity, config.metric);
    nullDistribution.push(permutedMetric);
  }

  // Calculate p-value (one-tailed test)
  // For metrics where higher is better (Sharpe, Sortino, total_return):
  // - p-value = proportion of permuted results > original (strictly better)
  // - Result is "significant" only if original > nullMean AND p-value < alpha
  // For metrics where lower is better (max_dd):
  // - p-value = proportion of permuted results < original (strictly better)
  // - Result is "significant" only if original < nullMean AND p-value < alpha
  const isLowerBetter = config.metric === "max_dd";

  // Calculate null distribution statistics first
  const nullMean = nullDistribution.reduce((sum, v) => sum + v, 0) / nullDistribution.length;
  const nullVariance =
    nullDistribution.reduce((sum, v) => sum + Math.pow(v - nullMean, 2), 0) /
    nullDistribution.length;
  const nullStdDev = Math.sqrt(nullVariance);
  const zScore = nullStdDev === 0 ? 0 : (originalMetric - nullMean) / nullStdDev;

  // Count how many permutations are BETTER than original (strictly better, not equal)
  const betterCount = nullDistribution.filter((value) =>
    isLowerBetter ? value < originalMetric : value > originalMetric,
  ).length;
  const pValue = betterCount / config.iterations;

  // Check if result is in the "good" direction AND statistically significant
  const isInGoodDirection = isLowerBetter ? originalMetric < nullMean : originalMetric > nullMean;
  const isSignificant = isInGoodDirection && pValue < alpha;

  return {
    testId,
    originalMetric,
    pValue,
    isSignificant,
    alpha,
    nullDistribution,
    nullMean,
    nullStdDev,
    zScore,
  };
}

/**
 * Create a human-readable interpretation of permutation test results
 */
export function interpretPermutationTest(result: PermutationTestResult): string {
  const { pValue, alpha, isSignificant, originalMetric, nullMean, zScore } = result;

  // Check if result is worse than random (bad direction)
  const isWorseThanRandom = originalMetric < nullMean;

  if (isWorseThanRandom) {
    return (
      `The result is WORSE than random chance. ` +
      `The observed metric (${originalMetric.toFixed(4)}) is below the null mean (${nullMean.toFixed(4)}), ` +
      `indicating the strategy performs worse than randomly shuffled trades. ` +
      `This suggests the strategy has negative edge.`
    );
  }

  if (isSignificant) {
    return (
      `The result is statistically significant (p = ${pValue.toFixed(4)} < ${alpha}). ` +
      `The observed metric (${originalMetric.toFixed(4)}) is unlikely to have occurred by chance. ` +
      `It is ${Math.abs(zScore).toFixed(2)} standard deviations above the null mean (${nullMean.toFixed(4)}).`
    );
  } else {
    return (
      `The result is NOT statistically significant (p = ${pValue.toFixed(4)} >= ${alpha}). ` +
      `The observed metric (${originalMetric.toFixed(4)}) could plausibly have occurred by chance. ` +
      `It is only ${Math.abs(zScore).toFixed(2)} standard deviations from the null mean (${nullMean.toFixed(4)}).`
    );
  }
}
