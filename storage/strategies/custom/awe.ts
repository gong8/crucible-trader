import type { StrategyBar, StrategySignal, StrategyContext } from "@crucible-trader/sdk";

export interface StrategyConfig {
  // Add your configuration parameters here
  period: number;
}

export const metadata = {
  name: "my-custom-strategy",
  description: "Describe what your strategy does",
  version: "1.0.0",
  author: "Your Name",
  tags: ["custom"],
};

/**
 * Create a strategy instance with the given configuration.
 */
export function createStrategy(config: StrategyConfig) {
  // Track state between bars
  const bars: StrategyBar[] = [];

  return {
    /**
     * Called once before the backtest starts.
     */
    onInit(context: StrategyContext): void {
      console.log(`Strategy initialized for symbol: ${context.symbol}`);
    },

    /**
     * Called for each bar in the backtest.
     * @param context - Strategy context with symbol info
     * @param bar - Current price bar
     * @returns Signal object or null
     */
    onBar(context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      // Store bars for indicator calculations
      bars.push(bar);

      // Not enough data yet
      if (bars.length < config.period) {
        return null;
      }

      // TODO: Implement your strategy logic here
      // 1. Calculate indicators using bars array
      // 2. Generate buy/sell signals
      // 3. Return signal object with side, timestamp, and reason

      // Example signal (replace with your logic):
      // return {
      //   side: "buy",
      //   timestamp: bar.timestamp,
      //   reason: "Your entry reason here"
      // };

      return null;
    },

    /**
     * Called once at the end of the backtest.
     */
    onStop(context: StrategyContext): StrategySignal | null {
      // Optional: Return exit signal to close any open positions
      return null;
    },
  };
}
