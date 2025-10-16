import { z } from "zod";

import type { StrategyBar, StrategyContext, StrategySignal, StrategyFactory } from "./types.js";

export const name = "breakout" as const;

export const schema = z.object({
  lookback: z.number().int().min(1),
  confirm: z.number().int().min(1).default(1),
});

export type BreakoutParams = z.infer<typeof schema>;

export const factory: StrategyFactory<BreakoutParams> = (paramsInput) => {
  const params: BreakoutParams = {
    ...paramsInput,
    confirm: paramsInput.confirm ?? 1,
  };
  const bars: StrategyBar[] = [];
  let breakoutStreak = 0;
  let breakdownStreak = 0;

  return {
    name,
    params,
    onInit() {
      bars.length = 0;
      breakoutStreak = 0;
      breakdownStreak = 0;
    },
    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      bars.push(bar);
      if (bars.length <= params.lookback) {
        return null;
      }

      const previousWindow = bars.slice(-(params.lookback + 1), -1);
      const highestHigh = Math.max(...previousWindow.map((item) => item.high));
      const lowestLow = Math.min(...previousWindow.map((item) => item.low));

      let signal: StrategySignal | null = null;

      if (bar.close > highestHigh) {
        breakoutStreak += 1;
        breakdownStreak = 0;
        if (breakoutStreak >= params.confirm) {
          signal = {
            side: "buy",
            timestamp: bar.timestamp,
            reason: "price_breakout_above_range",
            strength: breakoutStreak,
          };
          breakoutStreak = 0;
        }
      } else if (bar.close < lowestLow) {
        breakdownStreak += 1;
        breakoutStreak = 0;
        if (breakdownStreak >= params.confirm) {
          signal = {
            side: "sell",
            timestamp: bar.timestamp,
            reason: "price_breakdown_below_range",
            strength: breakdownStreak,
          };
          breakdownStreak = 0;
        }
      } else {
        breakoutStreak = 0;
        breakdownStreak = 0;
      }

      return signal;
    },
    onStop(): StrategySignal | null {
      return null;
    },
  };
};
