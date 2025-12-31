import type { StrategyBar, StrategyContext, StrategySignal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  rsiLength: number;
  oversold: number;
  overbought: number;
  exitMid: number;
  minHoldBars: number;
  requireCross: boolean;
}

export const defaultConfig: StrategyConfig = {
  rsiLength: 14,
  oversold: 30,
  overbought: 70,
  exitMid: 50,
  minHoldBars: 1,
  requireCross: true,
};

export const configSchema = {
  rsiLength: {
    type: "number",
    label: "RSI Length",
    default: defaultConfig.rsiLength,
    min: 2,
    max: 100,
    description: "Period for RSI (Wilder smoothing) calculation",
  },
  oversold: {
    type: "number",
    label: "Oversold Threshold",
    default: defaultConfig.oversold,
    min: 1,
    max: 49,
    description: "RSI level considered oversold (long bias trigger zone)",
  },
  overbought: {
    type: "number",
    label: "Overbought Threshold",
    default: defaultConfig.overbought,
    min: 51,
    max: 99,
    description: "RSI level considered overbought (short bias trigger zone)",
  },
  exitMid: {
    type: "number",
    label: "Exit Midline",
    default: defaultConfig.exitMid,
    min: 2,
    max: 98,
    description: "Midline used for mean-reversion exits (validated against thresholds at runtime)",
  },
  minHoldBars: {
    type: "number",
    label: "Min Hold Bars",
    default: defaultConfig.minHoldBars,
    min: 0,
    max: 500,
    description: "Minimum bars to hold before allowing exits or flips",
  },
  requireCross: {
    type: "boolean",
    label: "Require Threshold Cross",
    default: defaultConfig.requireCross,
    description:
      "If true, entries require RSI crossing back through the threshold (rather than simply being beyond it)",
  },
} as const;

export const metadata = {
  name: "rsi-reversion",
  description:
    "Mean-reversion RSI strategy: enters long after oversold (and optional cross up), enters short after overbought (and optional cross down), exits near midline.",
  version: "1.0.0",
  author: "Crucible Strategy Architect",
  tags: ["rsi", "mean-reversion", "oscillator"],
};

type Position = "flat" | "long" | "short";

export function createStrategy(config: StrategyConfig) {
  const settings = { ...defaultConfig, ...config };

  const closes: number[] = [];
  let lastBarTimestamp: string | null = null;

  let avgGain: number | null = null;
  let avgLoss: number | null = null;
  let prevClose: number | null = null;

  let prevRsi: number | null = null;
  let position: Position = "flat";
  let barsInPosition = 0;

  const clamp = (value: number, min: number, max: number): number => {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  };

  const isFiniteNumber = (n: number): boolean => Number.isFinite(n);

  const computeInitialAverages = (
    values: ReadonlyArray<number>,
    length: number,
  ): { gain: number; loss: number } | null => {
    if (values.length < length + 1) return null;
    let gains = 0;
    let losses = 0;
    const start = values.length - (length + 1);
    for (let i = start + 1; i < values.length; i++) {
      const diff = values[i] - values[i - 1];
      if (diff > 0) gains += diff;
      else losses += -diff;
    }
    return { gain: gains / length, loss: losses / length };
  };

  const rsiFromAverages = (gain: number, loss: number): number => {
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  };

  const validateSettings = (s: StrategyConfig): StrategyConfig => {
    const rsiLength = Math.max(2, Math.floor(s.rsiLength));
    const oversold = clamp(s.oversold, 1, 49);
    const overbought = clamp(s.overbought, 51, 99);
    const exitMid = clamp(s.exitMid, oversold + 1, overbought - 1);
    const minHoldBars = Math.max(0, Math.floor(s.minHoldBars));
    const requireCross = !!s.requireCross;
    return { rsiLength, oversold, overbought, exitMid, minHoldBars, requireCross };
  };

  const s = validateSettings(settings);

  return {
    onInit() {
      closes.length = 0;
      lastBarTimestamp = null;

      avgGain = null;
      avgLoss = null;
      prevClose = null;

      prevRsi = null;
      position = "flat";
      barsInPosition = 0;
    },

    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      lastBarTimestamp = bar.timestamp;

      const close = bar.close;
      if (!isFiniteNumber(close)) {
        return null;
      }

      closes.push(close);
      const maxKeep = s.rsiLength + 1;
      if (closes.length > maxKeep) {
        closes.shift();
      }

      if (prevClose === null) {
        prevClose = close;
        return null;
      }

      if (avgGain === null || avgLoss === null) {
        if (closes.length < s.rsiLength + 1) {
          prevClose = close;
          return null;
        }
        const init = computeInitialAverages(closes, s.rsiLength);
        if (init === null) {
          prevClose = close;
          return null;
        }
        avgGain = init.gain;
        avgLoss = init.loss;
      } else {
        const diff = close - prevClose;
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (s.rsiLength - 1) + gain) / s.rsiLength;
        avgLoss = (avgLoss * (s.rsiLength - 1) + loss) / s.rsiLength;
      }

      prevClose = close;

      if (avgGain === null || avgLoss === null) {
        return null;
      }

      const rsi = rsiFromAverages(avgGain, avgLoss);

      if (prevRsi === null) {
        prevRsi = rsi;
        return null;
      }

      let signal: StrategySignal | null = null;

      const crossedUpOversold = prevRsi <= s.oversold && rsi > s.oversold;
      const crossedDownOverbought = prevRsi >= s.overbought && rsi < s.overbought;

      const eligibleToFlip = barsInPosition >= s.minHoldBars;

      if (position === "flat") {
        if (s.requireCross) {
          if (crossedUpOversold) {
            position = "long";
            barsInPosition = 0;
            signal = {
              side: "buy",
              timestamp: bar.timestamp,
              reason: "enter_long_rsi_cross_up_oversold",
            };
          } else if (crossedDownOverbought) {
            position = "short";
            barsInPosition = 0;
            signal = {
              side: "sell",
              timestamp: bar.timestamp,
              reason: "enter_short_rsi_cross_down_overbought",
            };
          }
        } else {
          if (rsi < s.oversold) {
            position = "long";
            barsInPosition = 0;
            signal = {
              side: "buy",
              timestamp: bar.timestamp,
              reason: "enter_long_rsi_below_oversold",
            };
          } else if (rsi > s.overbought) {
            position = "short";
            barsInPosition = 0;
            signal = {
              side: "sell",
              timestamp: bar.timestamp,
              reason: "enter_short_rsi_above_overbought",
            };
          }
        }
      } else if (position === "long") {
        if (rsi >= s.exitMid && eligibleToFlip) {
          position = "flat";
          barsInPosition = 0;
          signal = { side: "sell", timestamp: bar.timestamp, reason: "exit_long_rsi_revert_mid" };
        } else if (rsi >= s.overbought && eligibleToFlip) {
          position = "short";
          barsInPosition = 0;
          signal = {
            side: "sell",
            timestamp: bar.timestamp,
            reason: "flip_long_to_short_rsi_overbought",
          };
        }
      } else {
        if (rsi <= s.exitMid && eligibleToFlip) {
          position = "flat";
          barsInPosition = 0;
          signal = { side: "buy", timestamp: bar.timestamp, reason: "exit_short_rsi_revert_mid" };
        } else if (rsi <= s.oversold && eligibleToFlip) {
          position = "long";
          barsInPosition = 0;
          signal = {
            side: "buy",
            timestamp: bar.timestamp,
            reason: "flip_short_to_long_rsi_oversold",
          };
        }
      }

      prevRsi = rsi;

      if (signal === null) {
        barsInPosition += 1;
      }

      // TODO[phase-2]: add optional trend filter (e.g., higher-timeframe SMA) without using context.history.
      // TODO[phase-3]: add stop-loss / take-profit logic driven by bar.high/low if available in StrategyBar.
      // TODO[phase-4]: add position sizing hints via extended signal fields if SDK supports them.

      return signal;
    },

    onStop(): StrategySignal | null {
      lastBarTimestamp = lastBarTimestamp;
      return null;
    },
  };
}
