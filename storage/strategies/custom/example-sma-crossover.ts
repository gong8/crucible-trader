import type { Bar, Signal } from "@crucible-trader/sdk";

export interface SMACrossoverConfig {
  fastPeriod: number;
  slowPeriod: number;
}

export const metadata = {
  name: "example-sma-crossover",
  description:
    "Simple Moving Average crossover strategy - goes long when fast MA crosses above slow MA, exits when it crosses below",
  version: "1.0.0",
  author: "Crucible Trader",
  tags: ["trend-following", "moving-average", "beginner-friendly"],
};

/**
 * Creates an SMA crossover strategy instance.
 *
 * Strategy Logic:
 * - Buy signal: Fast MA crosses above Slow MA
 * - Sell signal: Fast MA crosses below Slow MA
 *
 * @param config - Strategy configuration
 * @returns Strategy instance with onBar handler
 */
export function createStrategy(config: SMACrossoverConfig) {
  // Validate configuration
  if (config.fastPeriod >= config.slowPeriod) {
    throw new Error("Fast period must be less than slow period");
  }
  if (config.fastPeriod < 1 || config.slowPeriod < 2) {
    throw new Error("Periods must be positive integers");
  }

  // Track previous MA values for crossover detection
  let prevFastMA: number | null = null;
  let prevSlowMA: number | null = null;

  return {
    onBar(bar: Bar, index: number, bars: ReadonlyArray<Bar>): Signal | null {
      // Need enough bars to calculate slow MA
      if (index < config.slowPeriod - 1) {
        return null;
      }

      // Calculate current moving averages
      const fastMA = calculateSMA(bars, index, config.fastPeriod);
      const slowMA = calculateSMA(bars, index, config.slowPeriod);

      // Detect crossovers (requires previous values)
      if (prevFastMA !== null && prevSlowMA !== null) {
        // Bullish crossover: fast crosses above slow
        if (prevFastMA <= prevSlowMA && fastMA > slowMA) {
          prevFastMA = fastMA;
          prevSlowMA = slowMA;
          return "buy";
        }

        // Bearish crossover: fast crosses below slow
        if (prevFastMA >= prevSlowMA && fastMA < slowMA) {
          prevFastMA = fastMA;
          prevSlowMA = slowMA;
          return "sell";
        }
      }

      // Update state for next bar
      prevFastMA = fastMA;
      prevSlowMA = slowMA;

      return null;
    },
  };
}

/**
 * Calculate Simple Moving Average for a given period.
 *
 * @param bars - Array of all bars
 * @param currentIndex - Current bar index
 * @param period - Number of bars to average
 * @returns SMA value
 */
function calculateSMA(bars: ReadonlyArray<Bar>, currentIndex: number, period: number): number {
  const startIndex = Math.max(0, currentIndex - period + 1);
  const relevantBars = bars.slice(startIndex, currentIndex + 1);
  const sum = relevantBars.reduce((acc, bar) => acc + bar.close, 0);
  return sum / relevantBars.length;
}
