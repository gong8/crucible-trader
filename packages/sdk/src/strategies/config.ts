import type { z } from "zod";

import * as breakout from "./breakout.js";
import * as chaosTrader from "./chaos_trader.js";
import * as meanReversion from "./mean_reversion.js";
import * as momentum from "./momentum.js";
import * as smaCrossover from "./sma_crossover.js";

export type StrategyKey =
  | typeof smaCrossover.name
  | typeof momentum.name
  | typeof meanReversion.name
  | typeof breakout.name
  | typeof chaosTrader.name;

export interface StrategyField {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly type: "number";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface StrategyConfig {
  readonly key: StrategyKey;
  readonly title: string;
  readonly description: string;
  readonly defaults: Record<string, number>;
  readonly fields: ReadonlyArray<StrategyField>;
  readonly schema: z.ZodTypeAny;
}

export const strategyConfigs: Record<StrategyKey, StrategyConfig> = {
  [smaCrossover.name]: {
    key: smaCrossover.name,
    title: "SMA Crossover",
    description: "Trend-following crossover with fast/slow moving averages.",
    defaults: { fastLength: 5, slowLength: 15 },
    fields: [
      {
        key: "fastLength",
        label: "Fast Length",
        description: "Short-term SMA window size.",
        type: "number",
        min: 1,
        step: 1,
      },
      {
        key: "slowLength",
        label: "Slow Length",
        description: "Long-term SMA window size.",
        type: "number",
        min: 2,
        step: 1,
      },
    ],
    schema: smaCrossover.schema,
  },
  [momentum.name]: {
    key: momentum.name,
    title: "Momentum",
    description: "Breakout strategy triggered by momentum threshold.",
    defaults: { lookback: 14, threshold: 0.02 },
    fields: [
      {
        key: "lookback",
        label: "Lookback",
        description: "Bars to include when calculating rate of change.",
        type: "number",
        min: 1,
        step: 1,
      },
      {
        key: "threshold",
        label: "Threshold",
        description: "Minimum momentum (fractional) required to trade.",
        type: "number",
        min: 0,
        step: 0.001,
      },
    ],
    schema: momentum.schema,
  },
  [meanReversion.name]: {
    key: meanReversion.name,
    title: "Mean Reversion",
    description: "Buys oversold conditions and sells overbought extremes.",
    defaults: { lookback: 20, zScore: 2 },
    fields: [
      {
        key: "lookback",
        label: "Lookback",
        description: "Window for calculating z-score.",
        type: "number",
        min: 2,
        step: 1,
      },
      {
        key: "zScore",
        label: "Z-Score Threshold",
        type: "number",
        min: 0.5,
        step: 0.5,
      },
    ],
    schema: meanReversion.schema,
  },
  [breakout.name]: {
    key: breakout.name,
    title: "Breakout",
    description: "Range breakout with configurable confirmation.",
    defaults: { lookback: 20, confirm: 2 },
    fields: [
      {
        key: "lookback",
        label: "Lookback",
        type: "number",
        min: 1,
        step: 1,
      },
      {
        key: "confirm",
        label: "Confirmation Bars",
        description: "Number of consecutive bars to confirm breakout.",
        type: "number",
        min: 1,
        step: 1,
      },
    ],
    schema: breakout.schema,
  },
  [chaosTrader.name]: {
    key: chaosTrader.name,
    title: "Chaos Trader",
    description: "Stress-test strategy with erratic signal output.",
    defaults: { volatilityThreshold: 0.005, tradeFrequency: 3 },
    fields: [
      {
        key: "volatilityThreshold",
        label: "Volatility Threshold",
        type: "number",
        min: 0,
        step: 0.001,
      },
      {
        key: "tradeFrequency",
        label: "Trade Frequency",
        type: "number",
        min: 1,
        step: 1,
      },
    ],
    schema: chaosTrader.schema,
  },
};

export const strategyList = Object.values(strategyConfigs);
