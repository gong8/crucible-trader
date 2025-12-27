import type { StrategyBar, StrategySignal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  fastPeriod: number;
  slowPeriod: number;
}

export const metadata = {
  name: "Simple SMA Crossover",
  description: "Buys when fast SMA crosses above slow SMA, sells when it crosses below",
  version: "1.0.0",
  author: "Crucible Trader",
  tags: ["custom", "sma", "crossover", "trend-following"],
};

export const configSchema = {
  fastPeriod: {
    type: "number" as const,
    label: "Fast SMA Period",
    default: 10,
    min: 5,
    max: 50,
    description: "Period for the fast moving average",
  },
  slowPeriod: {
    type: "number" as const,
    label: "Slow SMA Period",
    default: 30,
    min: 10,
    max: 200,
    description: "Period for the slow moving average",
  },
};

function sma(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

function getTimestamp(bar: any) {
  return bar.timestamp ?? bar.time ?? bar.t ?? Date.now();
}

export function createStrategy(config: StrategyConfig) {
  const history: StrategyBar[] = [];
  let lastSignalIndex = -999;

  return {
    onInit(context: any) {
      history.length = 0;
      lastSignalIndex = -999;
    },

    onStop(context: any) {
      // Optional cleanup
    },

    onBar(context: any, bar: StrategyBar): StrategySignal | null {
      history.push(bar);
      const index = history.length - 1;

      const fastPeriod = config.fastPeriod || 10;
      const slowPeriod = config.slowPeriod || 30;

      // Need enough bars for slow SMA
      if (index < slowPeriod) return null;

      // Prevent signal spam
      if (index - lastSignalIndex < 3) return null;

      const prices = history.map((b) => b.close);
      const fastSMA = sma(prices, fastPeriod);
      const slowSMA = sma(prices, slowPeriod);

      // Previous values for crossover detection
      const prevPrices = history.slice(0, -1).map((b) => b.close);
      const prevFastSMA = sma(prevPrices, fastPeriod);
      const prevSlowSMA = sma(prevPrices, slowPeriod);

      const ts = getTimestamp(bar);

      // Bullish crossover: fast crosses above slow
      if (prevFastSMA <= prevSlowSMA && fastSMA > slowSMA) {
        lastSignalIndex = index;
        return {
          side: "buy",
          timestamp: ts,
          reason: `SMA Crossover: Fast(${fastSMA.toFixed(2)}) crossed above Slow(${slowSMA.toFixed(2)})`,
        } as any;
      }

      // Bearish crossover: fast crosses below slow
      if (prevFastSMA >= prevSlowSMA && fastSMA < slowSMA) {
        lastSignalIndex = index;
        return {
          side: "sell",
          timestamp: ts,
          reason: `SMA Crossover: Fast(${fastSMA.toFixed(2)}) crossed below Slow(${slowSMA.toFixed(2)})`,
        } as any;
      }

      return null;
    },
  };
}
