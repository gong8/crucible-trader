import type { StrategyBar, StrategyContext, StrategySignal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  fastLength: number;
  slowLength: number;
  minSpread: number;
}

export const defaultConfig: StrategyConfig = {
  fastLength: 5,
  slowLength: 20,
  minSpread: 0,
};

export const metadata = {
  name: "simple-sma-test",
  description:
    "Very simple SMA crossover test strategy: buy on fast-over-slow cross, sell on slow-over-fast cross.",
  version: "1.0.0",
  author: "Crucible Strategy Architect",
  tags: ["test", "sma", "crossover", "simple"],
};

export function createStrategy(config: StrategyConfig) {
  const settings: StrategyConfig = { ...defaultConfig, ...config };

  const closes: number[] = [];
  let fastPrev: number | null = null;
  let slowPrev: number | null = null;
  let lastBarTimestamp: string | null = null;

  const isFiniteNumber = (n: number): boolean => Number.isFinite(n);

  const sum = (values: ReadonlyArray<number>): number => {
    let s = 0;
    for (let i = 0; i < values.length; i += 1) s += values[i];
    return s;
  };

  const sma = (values: ReadonlyArray<number>): number => {
    return sum(values) / values.length;
  };

  const validLengths = (): boolean => {
    if (!Number.isInteger(settings.fastLength) || !Number.isInteger(settings.slowLength))
      return false;
    if (settings.fastLength < 2 || settings.slowLength < 3) return false;
    if (settings.fastLength >= settings.slowLength) return false;
    if (!isFiniteNumber(settings.minSpread) || settings.minSpread < 0) return false;
    return true;
  };

  return {
    onInit() {
      closes.length = 0;
      fastPrev = null;
      slowPrev = null;
      lastBarTimestamp = null;
    },

    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      if (!validLengths()) return null;
      if (lastBarTimestamp !== null && bar.timestamp === lastBarTimestamp) return null;
      lastBarTimestamp = bar.timestamp;

      if (!isFiniteNumber(bar.close)) return null;

      closes.push(bar.close);
      if (closes.length > settings.slowLength) closes.shift();

      if (closes.length < settings.slowLength) return null;

      const fastWindow = closes.slice(closes.length - settings.fastLength);
      if (fastWindow.length < settings.fastLength) return null;

      const fast = sma(fastWindow);
      const slow = sma(closes);

      if (!isFiniteNumber(fast) || !isFiniteNumber(slow)) return null;

      let signal: StrategySignal | null = null;

      if (fastPrev !== null && slowPrev !== null) {
        const prevSpread = fastPrev - slowPrev;
        const spread = fast - slow;

        const upThreshold = settings.minSpread;
        const downThreshold = -settings.minSpread;

        if (prevSpread <= 0 && spread > upThreshold) {
          signal = { side: "buy", timestamp: bar.timestamp, reason: "enter_long_fast_cross_up" };
        } else if (prevSpread >= 0 && spread < downThreshold) {
          signal = { side: "sell", timestamp: bar.timestamp, reason: "exit_long_fast_cross_down" };
        }
      }

      fastPrev = fast;
      slowPrev = slow;

      return signal;
    },

    onStop(): StrategySignal | null {
      return null;
    },
  };
}
