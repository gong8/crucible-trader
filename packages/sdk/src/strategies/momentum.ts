import { z } from "zod";

import type { StrategyBar, StrategyContext, StrategySignal, StrategyFactory } from "./types.js";

export const name = "momentum" as const;

export const schema = z.object({
  lookback: z.number().int().min(1),
  threshold: z.number().min(0),
});

export type MomentumParams = z.infer<typeof schema>;

export const factory: StrategyFactory<MomentumParams> = (params) => {
  const closes: number[] = [];

  return {
    name,
    params,
    onInit() {
      closes.length = 0;
    },
    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      closes.push(bar.close);
      if (closes.length <= params.lookback) {
        return null;
      }

      const priorIndex = closes.length - 1 - params.lookback;
      const priorClose = closes[priorIndex];
      if (priorClose === undefined || priorClose === 0) {
        return null;
      }
      const change = (bar.close - priorClose) / priorClose;

      if (change >= params.threshold) {
        return {
          side: "buy",
          timestamp: bar.timestamp,
          reason: "momentum_positive",
          strength: change,
        };
      }
      if (change <= -params.threshold) {
        return {
          side: "sell",
          timestamp: bar.timestamp,
          reason: "momentum_negative",
          strength: Math.abs(change),
        };
      }
      return null;
    },
    onStop(): StrategySignal | null {
      return null;
    },
  };
};
