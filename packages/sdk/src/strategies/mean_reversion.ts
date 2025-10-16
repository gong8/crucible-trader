import { z } from "zod";

import type { StrategyBar, StrategyContext, StrategySignal, StrategyFactory } from "./types.js";

export const name = "mean_reversion" as const;

export const schema = z.object({
  lookback: z.number().int().min(2),
  zScore: z.number().positive(),
});

export type MeanReversionParams = z.infer<typeof schema>;

export const factory: StrategyFactory<MeanReversionParams> = (params) => {
  const closes: number[] = [];

  return {
    name,
    params,
    onInit() {
      closes.length = 0;
    },
    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      closes.push(bar.close);
      if (closes.length < params.lookback) {
        return null;
      }

      const window = closes.slice(-params.lookback);
      const average = window.reduce((acc, value) => acc + value, 0) / window.length;
      const variance =
        window.reduce((acc, value) => {
          const diff = value - average;
          return acc + diff * diff;
        }, 0) / window.length;
      const std = Math.sqrt(variance);
      if (std === 0) {
        return null;
      }
      const zScore = (bar.close - average) / std;

      if (zScore <= -params.zScore) {
        return {
          side: "buy",
          timestamp: bar.timestamp,
          reason: "price_below_z_threshold",
          strength: Math.abs(zScore),
        };
      }
      if (zScore >= params.zScore) {
        return {
          side: "sell",
          timestamp: bar.timestamp,
          reason: "price_above_z_threshold",
          strength: Math.abs(zScore),
        };
      }
      return null;
    },
    onStop(): StrategySignal | null {
      return null;
    },
  };
};
