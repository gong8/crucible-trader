import type { StrategyBar, StrategyContext, StrategySignal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  fastLength: number;
  slowLength: number;
  signalLength: number;
  minHistogramAbs: number;
  maxBarsInPosition: number;
  cooldownBars: number;
}

export const defaultConfig: StrategyConfig = {
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  minHistogramAbs: 0,
  maxBarsInPosition: 200,
  cooldownBars: 0,
};

export const metadata = {
  name: "macd-crossover",
  description:
    "Generates signals on MACD line vs signal line crossovers with optional histogram threshold, max-hold exit, and cooldown.",
  version: "1.0.1",
  author: "Crucible Strategy Architect",
  tags: ["trend", "momentum", "macd"],
};

type PositionSide = "long" | "short";

export function createStrategy(config: StrategyConfig) {
  const settings: StrategyConfig = { ...defaultConfig, ...config };

  let emaFast: number | null = null;
  let emaSlow: number | null = null;
  let emaSignal: number | null = null;

  let macdPrev: number | null = null;
  let signalPrev: number | null = null;

  let position: PositionSide | null = null;
  let positionBars = 0;

  let cooldownRemaining = 0;
  let lastBarTimestamp: string | null = null;

  const isPositiveInt = (n: number): boolean => Number.isFinite(n) && n > 0 && Math.floor(n) === n;
  const isNonNegativeInt = (n: number): boolean =>
    Number.isFinite(n) && n >= 0 && Math.floor(n) === n;

  const validateSettings = (): void => {
    if (!isPositiveInt(settings.fastLength))
      throw new Error("fastLength must be a positive integer");
    if (!isPositiveInt(settings.slowLength))
      throw new Error("slowLength must be a positive integer");
    if (!isPositiveInt(settings.signalLength))
      throw new Error("signalLength must be a positive integer");
    if (settings.fastLength >= settings.slowLength)
      throw new Error("fastLength must be < slowLength");
    if (!Number.isFinite(settings.minHistogramAbs) || settings.minHistogramAbs < 0)
      throw new Error("minHistogramAbs must be a finite number >= 0");
    if (!isNonNegativeInt(settings.maxBarsInPosition))
      throw new Error("maxBarsInPosition must be an integer >= 0");
    if (!isNonNegativeInt(settings.cooldownBars))
      throw new Error("cooldownBars must be an integer >= 0");
  };

  const alpha = (length: number): number => 2 / (length + 1);

  const updateEma = (prev: number | null, value: number, length: number): number => {
    const a = alpha(length);
    return prev === null ? value : prev + a * (value - prev);
  };

  const requiredWarmupBars = (): number => settings.slowLength + settings.signalLength - 1;

  const crossUp = (prevA: number, prevB: number, a: number, b: number): boolean =>
    prevA <= prevB && a > b;
  const crossDown = (prevA: number, prevB: number, a: number, b: number): boolean =>
    prevA >= prevB && a < b;

  validateSettings();

  return {
    onInit(_context: StrategyContext) {
      emaFast = null;
      emaSlow = null;
      emaSignal = null;
      macdPrev = null;
      signalPrev = null;
      position = null;
      positionBars = 0;
      cooldownRemaining = 0;
      lastBarTimestamp = null;
    },

    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      const ts = bar.timestamp;
      lastBarTimestamp = ts;

      emaFast = updateEma(emaFast, bar.close, settings.fastLength);
      emaSlow = updateEma(emaSlow, bar.close, settings.slowLength);

      if (emaFast === null || emaSlow === null) {
        return null;
      }

      const macd = emaFast - emaSlow;
      emaSignal = updateEma(emaSignal, macd, settings.signalLength);

      if (emaSignal === null) {
        return null;
      }

      const signal = emaSignal;
      const histogram = macd - signal;

      if (macdPrev === null || signalPrev === null) {
        if (requiredWarmupBars() > 1) {
          requiredWarmupBars();
        }
        macdPrev = macd;
        signalPrev = signal;
        return null;
      }

      if (cooldownRemaining > 0) {
        cooldownRemaining -= 1;
      }

      if (position !== null) {
        positionBars += 1;

        if (settings.maxBarsInPosition > 0 && positionBars >= settings.maxBarsInPosition) {
          const exitSide: StrategySignal["side"] = position === "long" ? "sell" : "buy";
          position = null;
          positionBars = 0;
          cooldownRemaining = settings.cooldownBars;

          macdPrev = macd;
          signalPrev = signal;
          return { side: exitSide, timestamp: ts, reason: "exit_max_hold" };
        }

        if (
          position === "long" &&
          crossDown(macdPrev, signalPrev, macd, signal) &&
          Math.abs(histogram) >= settings.minHistogramAbs
        ) {
          position = null;
          positionBars = 0;
          cooldownRemaining = settings.cooldownBars;

          macdPrev = macd;
          signalPrev = signal;
          return { side: "sell", timestamp: ts, reason: "exit_long_macd_cross_down" };
        }

        if (
          position === "short" &&
          crossUp(macdPrev, signalPrev, macd, signal) &&
          Math.abs(histogram) >= settings.minHistogramAbs
        ) {
          position = null;
          positionBars = 0;
          cooldownRemaining = settings.cooldownBars;

          macdPrev = macd;
          signalPrev = signal;
          return { side: "buy", timestamp: ts, reason: "exit_short_macd_cross_up" };
        }

        macdPrev = macd;
        signalPrev = signal;
        return null;
      }

      if (cooldownRemaining > 0) {
        macdPrev = macd;
        signalPrev = signal;
        return null;
      }

      if (
        crossUp(macdPrev, signalPrev, macd, signal) &&
        Math.abs(histogram) >= settings.minHistogramAbs
      ) {
        position = "long";
        positionBars = 0;

        macdPrev = macd;
        signalPrev = signal;
        return { side: "buy", timestamp: ts, reason: "enter_long_macd_cross_up" };
      }

      if (
        crossDown(macdPrev, signalPrev, macd, signal) &&
        Math.abs(histogram) >= settings.minHistogramAbs
      ) {
        position = "short";
        positionBars = 0;

        macdPrev = macd;
        signalPrev = signal;
        return { side: "sell", timestamp: ts, reason: "enter_short_macd_cross_down" };
      }

      macdPrev = macd;
      signalPrev = signal;
      return null;
    },

    onStop(_context: StrategyContext): StrategySignal | null {
      // TODO[phase-2]: Optionally emit a final exit signal based on portfolio state if supported by the runtime.
      void lastBarTimestamp;
      return null;
    },
  };
}

export const configSchema = {
  fastLength: {
    type: "number",
    label: "Fast EMA Length",
    default: 12,
    min: 1,
    max: 50,
    description: "Period for fast EMA calculation",
  },
  slowLength: {
    type: "number",
    label: "Slow EMA Length",
    default: 26,
    min: 1,
    max: 100,
    description: "Period for slow EMA calculation",
  },
  signalLength: {
    type: "number",
    label: "Signal Line Length",
    default: 9,
    min: 1,
    max: 50,
    description: "Period for signal line EMA",
  },
  minHistogramAbs: {
    type: "number",
    label: "Min Histogram (absolute)",
    default: 0,
    min: 0,
    max: 10,
    description: "Minimum histogram value to trigger signals",
  },
  maxBarsInPosition: {
    type: "number",
    label: "Max Bars in Position",
    default: 200,
    min: 0,
    max: 1000,
    description: "Maximum number of bars to hold a position (0 = no limit)",
  },
  cooldownBars: {
    type: "number",
    label: "Cooldown Bars",
    default: 0,
    min: 0,
    max: 100,
    description: "Number of bars to wait after exiting before entering again",
  },
};
