import { strict as assert } from "node:assert";
import test from "node:test";

import { z } from "zod";

import { strategies } from "../src/index.js";
import type { Strategy, StrategyBar, StrategyContext, StrategySignal } from "../src/strategies/types.js";

const context: StrategyContext = { symbol: "TEST" };

const buildBars = (prices: number[]): StrategyBar[] =>
  prices.map((price, idx) => ({
    timestamp: new Date(Date.UTC(2024, 0, idx + 1)).toISOString(),
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1_000 + idx,
  }));

const runStrategy = (strategy: Strategy, bars: StrategyBar[]): StrategySignal[] => {
  const signals: StrategySignal[] = [];
  strategy.onInit(context);
  for (const bar of bars) {
    const signal = strategy.onBar(context, bar);
    if (signal) {
      signals.push(signal);
    }
  }
  const final = strategy.onStop(context);
  if (final) {
    signals.push(final);
  }
  return signals;
};

const parse = <Schema extends z.ZodTypeAny>(
  schema: Schema,
  params: z.input<Schema>,
): z.infer<Schema> => schema.parse(params);

test("sma crossover emits buy and sell signals on crossovers", () => {
  const params = parse(strategies.smaCrossover.schema, { fastLength: 2, slowLength: 4 });
  const strategy = strategies.smaCrossover.factory(params);
  const bars = buildBars([100, 101, 102, 103, 99, 98, 104, 107]);
  const signals = runStrategy(strategy, bars);
  assert.ok(signals.some((signal) => signal.side === "buy"), "expected buy signal");
  assert.ok(signals.some((signal) => signal.side === "sell"), "expected sell signal");
});

test("momentum strategy reacts to sustained moves", () => {
  const params = parse(strategies.momentum.schema, { lookback: 2, threshold: 0.015 });
  const strategy = strategies.momentum.factory(params);
  const bars = buildBars([100, 101, 103, 106, 104, 100]);
  const signals = runStrategy(strategy, bars);
  assert.ok(signals[0]?.side === "buy");
  assert.ok(signals.some((signal) => signal.side === "sell"));
});

test("mean reversion strategy triggers on z-score extremes", () => {
  const params = parse(strategies.meanReversion.schema, { lookback: 3, zScore: 1.0 });
  const strategy = strategies.meanReversion.factory(params);
  const bars = buildBars([100, 99, 98, 95, 100, 104]);
  const signals = runStrategy(strategy, bars);
  assert.ok(signals.some((signal) => signal.side === "buy"));
  assert.ok(signals.some((signal) => signal.side === "sell"));
});

test("breakout strategy emits signals on range breaks", () => {
  const params = parse(strategies.breakout.schema, { lookback: 3, confirm: 1 });
  const strategy = strategies.breakout.factory(params);
  const bars = buildBars([100, 101, 102, 99, 98, 97, 103, 96]);
  const signals = runStrategy(strategy, bars);
  assert.ok(signals.some((signal) => signal.side === "buy"));
  assert.ok(signals.some((signal) => signal.side === "sell"));
});
