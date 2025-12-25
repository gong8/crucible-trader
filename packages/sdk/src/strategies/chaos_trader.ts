import { z } from "zod";

import type { StrategyBar, StrategyContext, StrategySignal, StrategyFactory } from "./types.js";

export const name = "chaos_trader" as const;

export const schema = z.object({
  volatilityThreshold: z.number().min(0.001).max(0.1).default(0.005),
  tradeFrequency: z.number().int().min(1).max(10).default(3),
});

export type ChaosTraderParams = z.infer<typeof schema>;

/**
 * Chaos Trader - A highly erratic strategy for testing
 * Trades frequently based on price volatility and pseudo-random patterns
 */
export const factory: StrategyFactory<ChaosTraderParams> = (params) => {
  const priceHistory: number[] = [];
  let barCount = 0;
  let lastTradeBar = 0;
  let position: "long" | "flat" = "flat";

  return {
    name,
    params,
    onInit() {
      priceHistory.length = 0;
      barCount = 0;
      lastTradeBar = 0;
      position = "flat";
    },
    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      barCount++;
      priceHistory.push(bar.close);
      if (priceHistory.length > 20) {
        priceHistory.shift();
      }

      // Need at least a few bars to calculate volatility
      if (priceHistory.length < 5) {
        return null;
      }

      // Calculate short-term volatility
      const returns = [];
      for (let i = 1; i < priceHistory.length; i++) {
        const prev = priceHistory[i - 1];
        const curr = priceHistory[i];
        if (prev !== undefined && curr !== undefined) {
          returns.push((curr - prev) / prev);
        }
      }
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance);

      // Calculate momentum
      const firstPrice = priceHistory[0];
      if (firstPrice === undefined) {
        return null;
      }
      const momentum = (bar.close - firstPrice) / firstPrice;

      // Pseudo-random signal based on price hash
      const priceHash = Math.floor(bar.close * 1000) % 100;
      const isVolatile = volatility > params.volatilityThreshold;
      const shouldTrade = barCount - lastTradeBar >= params.tradeFrequency;

      if (!shouldTrade) {
        return null;
      }

      let signal: StrategySignal | null = null;

      // Chaotic trading logic:
      // 1. High volatility + positive momentum + lucky hash = BUY
      // 2. High volatility + negative momentum + unlucky hash = SELL
      // 3. Random reversals for chaos
      if (position === "flat") {
        if (isVolatile && momentum > 0 && priceHash > 50) {
          signal = {
            side: "buy",
            timestamp: bar.timestamp,
            reason: "chaos_entry_long",
          };
          position = "long";
          lastTradeBar = barCount;
        } else if (priceHash < 20) {
          // Random entry
          signal = {
            side: "buy",
            timestamp: bar.timestamp,
            reason: "chaos_random_entry",
          };
          position = "long";
          lastTradeBar = barCount;
        }
      } else if (position === "long") {
        // Exit conditions: volatility spike, momentum reversal, or random
        if ((isVolatile && momentum < -0.01) || priceHash < 30) {
          signal = {
            side: "sell",
            timestamp: bar.timestamp,
            reason: priceHash < 30 ? "chaos_random_exit" : "chaos_volatility_exit",
          };
          position = "flat";
          lastTradeBar = barCount;
        }
      }

      return signal;
    },
    onStop(): StrategySignal | null {
      // Close any open position
      if (position === "long") {
        return {
          side: "sell",
          timestamp: new Date().toISOString(),
          reason: "chaos_stop",
        };
      }
      return null;
    },
  };
};
