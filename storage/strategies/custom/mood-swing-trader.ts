import type { StrategyBar, StrategyContext, StrategySignal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  shortSmaLength: number;
  mediumSmaLength: number;
  minRangeForExcitement: number;
}

export const defaultConfig: StrategyConfig = {
  shortSmaLength: 3,
  mediumSmaLength: 7,
  minRangeForExcitement: 0.001,
};

export const metadata = {
  name: "mood-swing-trader",
  description:
    "A highly reactive strategy that flips mood on short SMA crossovers and trades happy/sad bars when volatility rises.",
  version: "1.0.0",
  author: "Crucible Fun Labs",
  tags: ["funky", "frequent", "sma", "volatility"],
};

export function createStrategy(config: StrategyConfig) {
  const settings = { ...defaultConfig, ...config };

  const closes: number[] = [];
  let smaShortPrev: number | null = null;
  let smaMediumPrev: number | null = null;
  let currentMood: "bullish" | "bearish" = "bullish";
  let currentPosition: "long" | "short" | "flat" = "flat";
  let lastBarTimestamp: string | null = null;

  const sma = (values: ReadonlyArray<number>): number => {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  return {
    onInit() {
      closes.length = 0;
      smaShortPrev = null;
      smaMediumPrev = null;
      currentMood = "bullish";
      currentPosition = "flat";
      lastBarTimestamp = null;
    },

    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      closes.push(bar.close);
      lastBarTimestamp = bar.timestamp;

      if (closes.length > settings.mediumSmaLength) {
        closes.shift();
      }
      if (closes.length < settings.mediumSmaLength) {
        return null;
      }

      const currentSmaShort = sma(closes.slice(-settings.shortSmaLength));
      const currentSmaMedium = sma(closes.slice(-settings.mediumSmaLength));

      let signal: StrategySignal | null = null;

      if (smaShortPrev !== null && smaMediumPrev !== null) {
        const prevSpread = smaShortPrev - smaMediumPrev;
        const currentSpread = currentSmaShort - currentSmaMedium;
        if (prevSpread <= 0 && currentSpread > 0) {
          currentMood = "bullish";
        } else if (prevSpread >= 0 && currentSpread < 0) {
          currentMood = "bearish";
        }
      }

      if (currentPosition === "long" && currentMood === "bearish") {
        signal = {
          side: "sell",
          timestamp: bar.timestamp,
          reason: "exit_long_mood_flipped_bearish",
        };
        currentPosition = "flat";
      } else if (currentPosition === "short" && currentMood === "bullish") {
        signal = {
          side: "buy",
          timestamp: bar.timestamp,
          reason: "exit_short_mood_flipped_bullish",
        };
        currentPosition = "flat";
      }

      if (signal === null && currentPosition === "flat") {
        const barRange = bar.high - bar.low;
        const minExcitementValue = settings.minRangeForExcitement * bar.close;
        if (barRange > minExcitementValue) {
          if (currentMood === "bullish" && bar.close > bar.open) {
            signal = {
              side: "buy",
              timestamp: bar.timestamp,
              reason: "enter_long_bullish_happy_excited",
            };
            currentPosition = "long";
          } else if (currentMood === "bearish" && bar.close < bar.open) {
            signal = {
              side: "sell",
              timestamp: bar.timestamp,
              reason: "enter_short_bearish_sad_excited",
            };
            currentPosition = "short";
          }
        }
      }

      smaShortPrev = currentSmaShort;
      smaMediumPrev = currentSmaMedium;
      return signal;
    },

    onStop(): StrategySignal | null {
      if (lastBarTimestamp === null) {
        return null;
      }
      if (currentPosition === "long") {
        return { side: "sell", timestamp: lastBarTimestamp, reason: "exit_long_on_stop" };
      }
      if (currentPosition === "short") {
        return { side: "buy", timestamp: lastBarTimestamp, reason: "exit_short_on_stop" };
      }
      return null;
    },
  };
}
