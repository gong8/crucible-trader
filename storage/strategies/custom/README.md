# Custom Strategies

This directory contains user-defined trading strategies for Crucible Trader.

## How to Create a Custom Strategy

Each strategy must export a `createStrategy` function that matches the `IStrategy` interface.

### Basic Template

```typescript
import type { Bar, Signal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  // Your custom parameters
  fastPeriod: number;
  slowPeriod: number;
}

export const metadata = {
  name: "my-custom-strategy",
  description: "Description of what this strategy does",
  version: "1.0.0",
  author: "Your Name",
};

/**
 * Create a strategy instance with the given configuration.
 */
export function createStrategy(config: StrategyConfig) {
  // Initialize any state
  const state = {
    fastMA: [] as number[],
    slowMA: [] as number[],
  };

  return {
    /**
     * Called for each bar in the backtest.
     * @param bar - Current OHLCV bar
     * @param index - Index in the bars array
     * @param bars - All bars up to current index
     * @returns Signal ('buy', 'sell', or null)
     */
    onBar(bar: Bar, index: number, bars: ReadonlyArray<Bar>): Signal | null {
      if (index < config.slowPeriod) {
        return null; // Not enough data yet
      }

      // Calculate your indicators
      const recentBars = bars.slice(index - config.slowPeriod, index + 1);
      const fastMA = calculateSMA(recentBars, config.fastPeriod);
      const slowMA = calculateSMA(recentBars, config.slowPeriod);

      // Generate signals
      if (fastMA > slowMA) {
        return "buy";
      } else if (fastMA < slowMA) {
        return "sell";
      }

      return null;
    },
  };
}

// Helper function example
function calculateSMA(bars: ReadonlyArray<Bar>, period: number): number {
  const prices = bars.slice(-period).map((b) => b.close);
  return prices.reduce((sum, p) => sum + p, 0) / prices.length;
}
```

### Important Notes

1. **File naming**: Use kebab-case (e.g., `my-strategy.ts`)
2. **Export metadata**: Required for the UI to display strategy info
3. **Type safety**: Import types from `@crucible-trader/sdk`
4. **Pure functions**: Strategies should be deterministic
5. **Performance**: Avoid expensive calculations in tight loops

### Available Types

```typescript
import type {
  Bar, // OHLCV data point
  Signal, // 'buy' | 'sell' | null
  Position, // Current position info
} from "@crucible-trader/sdk";
```

### Testing Your Strategy

1. **In Web UI**: Use the editor's "Test" button
2. **In CLI**: Run a backtest with your strategy name
3. **In Code**: Import and test manually

### Example Strategies

See `example-sma-crossover.ts` for a complete working example.

## Auto-Discovery

The engine automatically discovers and loads all `.ts` files in this directory at startup.

Make sure your strategy exports:

- `metadata` object
- `createStrategy` function

## Troubleshooting

**Strategy not appearing in dropdown?**

- Check that the file exports `metadata` and `createStrategy`
- Restart the API server to reload strategies
- Check server logs for import errors

**TypeScript errors?**

- Ensure `@crucible-trader/sdk` is installed
- Check your tsconfig.json matches the project settings
- Use the web editor for automatic validation
