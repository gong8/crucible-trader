import { z } from "zod";

import type { Strategy, StrategyBar, StrategyContext, StrategySignal } from "./types.js";
import type { StrategyFactory } from "./types.js";

export const name = "sma_crossover" as const;

export const schema = z
  .object({
    fastLength: z.number().int().min(1),
    slowLength: z.number().int().min(2),
  })
  .superRefine((value, ctx) => {
    if (value.fastLength >= value.slowLength) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fastLength must be less than slowLength",
        path: ["fastLength"],
      });
    }
  });

export type SmaCrossoverParams = z.infer<typeof schema>;

export const factory: StrategyFactory<SmaCrossoverParams> = (params) => {
  const closes: number[] = [];
  let prevFast: number | null = null;
  let prevSlow: number | null = null;

  const computeAverage = (values: ReadonlyArray<number>): number => {
    const sum = values.reduce((acc, value) => acc + value, 0);
    return sum / values.length;
  };

  return {
    name,
    params,
    onInit() {
      closes.length = 0;
      prevFast = null;
      prevSlow = null;
    },
    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      closes.push(bar.close);
      if (closes.length > params.slowLength) {
        closes.shift();
      }
      if (closes.length < params.slowLength) {
        return null;
      }
      const fastWindow = closes.slice(-params.fastLength);
      const fastAvg = computeAverage(fastWindow);
      const slowAvg = computeAverage(closes);

      let signal: StrategySignal | null = null;
      if (prevFast !== null && prevSlow !== null) {
        if (prevFast <= prevSlow && fastAvg > slowAvg) {
          signal = {
            side: "buy",
            timestamp: bar.timestamp,
            reason: "fast_sma_crossed_above_slow",
          };
        } else if (prevFast >= prevSlow && fastAvg < slowAvg) {
          signal = {
            side: "sell",
            timestamp: bar.timestamp,
            reason: "fast_sma_crossed_below_slow",
          };
        }
      }

      prevFast = fastAvg;
      prevSlow = slowAvg;
      return signal;
    },
    onStop(): StrategySignal | null {
      return null;
    },
  };
};
