/**
 * Parameter optimization utilities for grid search and walk-forward analysis.
 */

import type { ParamGrid, ParamRange } from "@crucible-trader/sdk";
import { createSeededRng } from "@crucible-trader/logger";

/**
 * Expands a parameter range specification into a list of discrete values.
 */
export function expandParamRange(range: ParamRange): number[] {
  if (Array.isArray(range)) {
    return [...range];
  }

  const { min, max, step } = range;
  const values: number[] = [];
  let current = min;

  while (current <= max) {
    values.push(current);
    current += step;
  }

  return values;
}

/**
 * Expands a parameter grid into all possible combinations.
 *
 * @param grid - Parameter grid specification
 * @returns Array of parameter combinations
 *
 * @example
 * ```typescript
 * const grid = {
 *   fastLength: [5, 10, 15],
 *   slowLength: { min: 20, max: 40, step: 10 }
 * };
 * const combos = expandParamGrid(grid);
 * // Returns: [
 * //   { fastLength: 5, slowLength: 20 },
 * //   { fastLength: 5, slowLength: 30 },
 * //   { fastLength: 5, slowLength: 40 },
 * //   { fastLength: 10, slowLength: 20 },
 * //   ...
 * // ]
 * ```
 */
export function expandParamGrid(grid: ParamGrid): Array<Record<string, number>> {
  const paramNames = Object.keys(grid);

  if (paramNames.length === 0) {
    return [{}];
  }

  // Expand each parameter range
  const expandedParams: Array<{ name: string; values: number[] }> = paramNames.map((name) => {
    const range = grid[name];
    if (!range) {
      throw new Error(`Parameter ${name} has undefined range`);
    }
    return {
      name,
      values: expandParamRange(range),
    };
  });

  // Generate cartesian product
  const combinations: Array<Record<string, number>> = [];

  function generateCombinations(index: number, current: Record<string, number>): void {
    if (index === expandedParams.length) {
      combinations.push({ ...current });
      return;
    }

    const param = expandedParams[index];
    if (!param) {
      throw new Error(`Param at index ${index} is undefined`);
    }
    for (const value of param.values) {
      current[param.name] = value;
      generateCombinations(index + 1, current);
    }
  }

  generateCombinations(0, {});
  return combinations;
}

/**
 * Configuration for walk-forward window generation.
 */
export interface WalkForwardConfig {
  /** Start date of the full period. */
  readonly start: string;
  /** End date of the full period. */
  readonly end: string;
  /** Number of months for in-sample window. */
  readonly inSampleMonths: number;
  /** Number of months for out-of-sample window. */
  readonly outSampleMonths: number;
  /** Whether to use anchored windows (always start from beginning). */
  readonly anchored?: boolean;
}

/**
 * Represents a single walk-forward window.
 */
export interface WalkForwardWindow {
  /** Window index (0-based). */
  readonly windowIndex: number;
  /** In-sample period. */
  readonly inSample: {
    readonly start: string;
    readonly end: string;
  };
  /** Out-of-sample period. */
  readonly outSample: {
    readonly start: string;
    readonly end: string;
  };
}

/**
 * Adds months to a date string (ISO format).
 */
function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  const parts = date.toISOString().split("T");
  if (!parts[0]) {
    throw new Error(`Failed to convert date to ISO string: ${dateStr}`);
  }
  return parts[0];
}

/**
 * Generates walk-forward windows for out-of-sample testing.
 *
 * @param config - Walk-forward configuration
 * @returns Array of walk-forward windows
 *
 * @example
 * ```typescript
 * const windows = generateWalkForwardWindows({
 *   start: '2020-01-01',
 *   end: '2024-12-31',
 *   inSampleMonths: 12,
 *   outSampleMonths: 3,
 *   anchored: false
 * });
 * // Returns multiple windows with rolling IS/OOS periods
 * ```
 */
export function generateWalkForwardWindows(config: WalkForwardConfig): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];
  const { start, end, inSampleMonths, outSampleMonths, anchored = false } = config;

  let currentStart = start;
  let windowIndex = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const inSampleEnd = addMonths(currentStart, inSampleMonths);
    const outSampleStart = inSampleEnd;
    const outSampleEnd = addMonths(outSampleStart, outSampleMonths);

    // Stop if OOS window extends beyond end date
    if (new Date(outSampleEnd) > new Date(end)) {
      break;
    }

    windows.push({
      windowIndex,
      inSample: {
        start: currentStart,
        end: inSampleEnd,
      },
      outSample: {
        start: outSampleStart,
        end: outSampleEnd,
      },
    });

    windowIndex++;

    // Move to next window
    if (anchored) {
      // Anchored: IS always starts from beginning, just extend OOS
      currentStart = start;
      // For next iteration, we'd need to adjust, but for anchored we typically
      // just have one window or we adjust the logic differently
      // For simplicity, break after first window in anchored mode
      break;
    } else {
      // Rolling: advance by OOS window size
      currentStart = outSampleEnd;
    }
  }

  return windows;
}

/**
 * Calculates a robustness score that penalizes parameter sets with:
 * - High drawdown
 * - Low number of trades
 * - Wide bootstrap confidence intervals
 * - Weak permutation p-values
 *
 * @param params - Scoring parameters
 * @returns Robustness score (0-1 scale, higher is better)
 */
export interface RobustnessParams {
  /** Primary objective score. */
  readonly objectiveScore: number;
  /** Maximum drawdown (negative value). */
  readonly maxDrawdown: number;
  /** Number of trades. */
  readonly numTrades: number;
  /** Bootstrap CI width (optional). */
  readonly bootstrapCIWidth?: number;
  /** Permutation p-value (optional). */
  readonly pValue?: number;
  /** Constraints for penalties. */
  readonly constraints?: {
    readonly maxDrawdownThreshold?: number;
    readonly minTradesThreshold?: number;
  };
}

/**
 * Calculates robustness score with penalties.
 */
export function calculateRobustnessScore(params: RobustnessParams): number {
  let score = params.objectiveScore;
  const constraints = params.constraints ?? {};

  // Penalty for high drawdown
  const maxDDThreshold = constraints.maxDrawdownThreshold ?? -0.3;
  if (params.maxDrawdown < maxDDThreshold) {
    const ddPenalty = Math.abs(params.maxDrawdown - maxDDThreshold) * 2;
    score *= Math.exp(-ddPenalty);
  }

  // Penalty for low trades
  const minTradesThreshold = constraints.minTradesThreshold ?? 10;
  if (params.numTrades < minTradesThreshold) {
    const tradePenalty = (minTradesThreshold - params.numTrades) / minTradesThreshold;
    score *= 1 - tradePenalty * 0.5;
  }

  // Penalty for wide bootstrap CI
  if (params.bootstrapCIWidth !== undefined) {
    const ciPenalty = Math.min(params.bootstrapCIWidth / Math.abs(params.objectiveScore), 1);
    score *= 1 - ciPenalty * 0.3;
  }

  // Penalty for weak p-value
  if (params.pValue !== undefined && params.pValue > 0.05) {
    const pValuePenalty = (params.pValue - 0.05) / 0.95;
    score *= 1 - pValuePenalty * 0.4;
  }

  return Math.max(0, score);
}

/**
 * Shuffles an array in place using a seeded RNG.
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const rng = createSeededRng(seed);
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    const swap = result[j];
    if (temp !== undefined && swap !== undefined) {
      result[i] = swap;
      result[j] = temp;
    }
  }

  return result;
}
