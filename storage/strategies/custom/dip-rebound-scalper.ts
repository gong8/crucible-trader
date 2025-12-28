import type { StrategyBar, StrategyContext, StrategySignal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  lookbackHigh: number;
  dipPct: number;
  reboundPct: number;
  rsiLength: number;
  rsiOversold: number;
  rsiOverbought: number;
  profitTargetPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxDipArmedBars: number;
  cooldownBarsAfterExit: number;
}

export const defaultConfig: StrategyConfig = {
  lookbackHigh: 30,
  dipPct: 0.015,
  reboundPct: 0.006,
  rsiLength: 14,
  rsiOversold: 32,
  rsiOverbought: 68,
  profitTargetPct: 0.018,
  stopLossPct: 0.012,
  trailingStopPct: 0.01,
  maxDipArmedBars: 8,
  cooldownBarsAfterExit: 3,
};

export const metadata = {
  name: "dip-rebound-scalper",
  description:
    "Waits for a pullback from the recent high plus oversold momentum, then buys on a small rebound; exits via profit target, stop loss, trailing stop, or overbought momentum.",
  version: "1.0.0",
  author: "Crucible Strategy Architect",
  tags: ["meanreversion", "rsi", "pullback", "scalping"],
};

export function createStrategy(config: StrategyConfig) {
  const settings: StrategyConfig = { ...defaultConfig, ...config };

  const closes: number[] = [];

  type PositionState = "flat" | "long";
  let position: PositionState = "flat";

  let lastBarTimestamp: string | null = null;

  let entryPrice: number | null = null;
  let entryTimestamp: string | null = null;
  let peakSinceEntry: number | null = null;

  let cooldownRemaining: number = 0;

  let dipArmed: boolean = false;
  let dipLow: number | null = null;
  let dipArmedAtIndex: number | null = null;

  const isFiniteNumber = (v: number): boolean => Number.isFinite(v);

  const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

  const sanitizeSettings = (s: StrategyConfig): StrategyConfig => {
    const lookbackHigh = Math.max(5, Math.floor(s.lookbackHigh));
    const rsiLength = Math.max(2, Math.floor(s.rsiLength));
    const maxDipArmedBars = Math.max(1, Math.floor(s.maxDipArmedBars));
    const cooldownBarsAfterExit = Math.max(0, Math.floor(s.cooldownBarsAfterExit));

    const dipPct = clamp(s.dipPct, 0.002, 0.08);
    const reboundPct = clamp(s.reboundPct, 0.001, 0.05);

    const rsiOversold = clamp(s.rsiOversold, 5, 50);
    const rsiOverbought = clamp(s.rsiOverbought, 50, 95);

    const profitTargetPct = clamp(s.profitTargetPct, 0.002, 0.2);
    const stopLossPct = clamp(s.stopLossPct, 0.002, 0.2);
    const trailingStopPct = clamp(s.trailingStopPct, 0.002, 0.2);

    return {
      lookbackHigh,
      dipPct,
      reboundPct,
      rsiLength,
      rsiOversold,
      rsiOverbought,
      profitTargetPct,
      stopLossPct,
      trailingStopPct,
      maxDipArmedBars,
      cooldownBarsAfterExit,
    };
  };

  const safeSettings = sanitizeSettings(settings);

  const highest = (values: ReadonlyArray<number>): number => {
    let h = -Infinity;
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v > h) h = v;
    }
    return h;
  };

  const computeRSI = (values: ReadonlyArray<number>, length: number): number | null => {
    const needed = length + 1;
    if (values.length < needed) return null;

    let gains = 0;
    let losses = 0;
    const start = values.length - needed;

    for (let i = start + 1; i < values.length; i += 1) {
      const delta = values[i] - values[i - 1];
      if (delta > 0) gains += delta;
      else losses += -delta;
    }

    const avgGain = gains / length;
    const avgLoss = losses / length;

    if (!isFiniteNumber(avgGain) || !isFiniteNumber(avgLoss)) return null;
    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    return isFiniteNumber(rsi) ? rsi : null;
  };

  const resetDipArm = (): void => {
    dipArmed = false;
    dipLow = null;
    dipArmedAtIndex = null;
  };

  const armDip = (low: number, index: number): void => {
    dipArmed = true;
    dipLow = low;
    dipArmedAtIndex = index;
  };

  const updateDipLow = (low: number): void => {
    if (!dipArmed) return;
    if (dipLow === null || low < dipLow) dipLow = low;
  };

  const disarmDipIfExpired = (currentIndex: number): void => {
    if (!dipArmed) return;
    if (dipArmedAtIndex === null) {
      resetDipArm();
      return;
    }
    const age = currentIndex - dipArmedAtIndex;
    if (age > safeSettings.maxDipArmedBars) resetDipArm();
  };

  const makeSignal = (side: "buy" | "sell", timestamp: string, reason: string): StrategySignal => {
    return { side, timestamp, reason };
  };

  return {
    onInit(): void {
      closes.length = 0;

      position = "flat";
      lastBarTimestamp = null;

      entryPrice = null;
      entryTimestamp = null;
      peakSinceEntry = null;

      cooldownRemaining = 0;

      resetDipArm();
    },

    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      lastBarTimestamp = bar.timestamp;

      closes.push(bar.close);
      const maxKeep = Math.max(safeSettings.lookbackHigh, safeSettings.rsiLength + 1) + 5;
      while (closes.length > maxKeep) closes.shift();

      if (cooldownRemaining > 0) cooldownRemaining -= 1;

      const idx = closes.length - 1;

      if (closes.length < safeSettings.rsiLength + 1) return null;
      const rsi = computeRSI(closes, safeSettings.rsiLength);
      if (rsi === null) return null;

      if (closes.length < safeSettings.lookbackHigh) return null;
      const recentWindow = closes.slice(closes.length - safeSettings.lookbackHigh);
      const recentHigh = highest(recentWindow);
      if (!isFiniteNumber(recentHigh) || recentHigh <= 0) return null;

      const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
      if (prevClose === null || !isFiniteNumber(prevClose) || prevClose <= 0) return null;

      disarmDipIfExpired(idx);

      if (position === "long") {
        if (entryPrice === null || entryTimestamp === null) {
          position = "flat";
          resetDipArm();
          cooldownRemaining = safeSettings.cooldownBarsAfterExit;
          return makeSignal("sell", bar.timestamp, "exit_long_state_desync");
        }

        if (peakSinceEntry === null || !isFiniteNumber(peakSinceEntry)) {
          peakSinceEntry = bar.close;
        } else if (bar.close > peakSinceEntry) {
          peakSinceEntry = bar.close;
        }

        const takeProfit = entryPrice * (1 + safeSettings.profitTargetPct);
        const stopLoss = entryPrice * (1 - safeSettings.stopLossPct);
        const trailingStop = (peakSinceEntry ?? entryPrice) * (1 - safeSettings.trailingStopPct);

        if (
          !isFiniteNumber(takeProfit) ||
          !isFiniteNumber(stopLoss) ||
          !isFiniteNumber(trailingStop)
        )
          return null;

        if (bar.close >= takeProfit) {
          position = "flat";
          entryPrice = null;
          entryTimestamp = null;
          peakSinceEntry = null;
          resetDipArm();
          cooldownRemaining = safeSettings.cooldownBarsAfterExit;
          return makeSignal("sell", bar.timestamp, "take_profit");
        }

        if (bar.close <= stopLoss) {
          position = "flat";
          entryPrice = null;
          entryTimestamp = null;
          peakSinceEntry = null;
          resetDipArm();
          cooldownRemaining = safeSettings.cooldownBarsAfterExit;
          return makeSignal("sell", bar.timestamp, "stop_loss");
        }

        if (bar.close <= trailingStop) {
          position = "flat";
          entryPrice = null;
          entryTimestamp = null;
          peakSinceEntry = null;
          resetDipArm();
          cooldownRemaining = safeSettings.cooldownBarsAfterExit;
          return makeSignal("sell", bar.timestamp, "trailing_stop");
        }

        if (rsi >= safeSettings.rsiOverbought) {
          position = "flat";
          entryPrice = null;
          entryTimestamp = null;
          peakSinceEntry = null;
          resetDipArm();
          cooldownRemaining = safeSettings.cooldownBarsAfterExit;
          return makeSignal("sell", bar.timestamp, "rsi_overbought");
        }

        return null;
      }

      if (cooldownRemaining > 0) {
        resetDipArm();
        return null;
      }

      const dipThreshold = recentHigh * (1 - safeSettings.dipPct);
      if (!isFiniteNumber(dipThreshold) || dipThreshold <= 0) return null;

      const isDip = bar.close <= dipThreshold && rsi <= safeSettings.rsiOversold;

      if (!dipArmed) {
        if (isDip) armDip(bar.close, idx);
        return null;
      }

      updateDipLow(bar.close);

      if (dipLow === null || !isFiniteNumber(dipLow) || dipLow <= 0) {
        resetDipArm();
        return null;
      }

      const reboundLevel = dipLow * (1 + safeSettings.reboundPct);
      if (!isFiniteNumber(reboundLevel) || reboundLevel <= 0) return null;

      const reboundConfirmed = bar.close >= reboundLevel && bar.close > prevClose;

      if (reboundConfirmed) {
        position = "long";
        entryPrice = bar.close;
        entryTimestamp = bar.timestamp;
        peakSinceEntry = bar.close;

        resetDipArm();

        return makeSignal("buy", bar.timestamp, "dip_rebound_entry");
      }

      if (!isDip && rsi > safeSettings.rsiOversold + 8) {
        resetDipArm();
        return null;
      }

      return null;
    },

    onStop(): StrategySignal | null {
      if (position === "long" && lastBarTimestamp !== null) {
        position = "flat";
        entryPrice = null;
        entryTimestamp = null;
        peakSinceEntry = null;
        resetDipArm();
        cooldownRemaining = safeSettings.cooldownBarsAfterExit;
        return makeSignal("sell", lastBarTimestamp, "exit_long_on_stop");
      }
      return null;
    },
  };
}
