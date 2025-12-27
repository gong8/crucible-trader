import type { StrategyBar, StrategySignal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  period: number; // e.g. 40
}

export const metadata = {
  name: "coil-pulse-reverter",
  description:
    "Trades volatility coils (compression→expansion breakouts) and panic reversion (high-vol RSI extremes).",
  version: "1.0.0",
  author: "Your Name",
  tags: ["custom", "volatility", "breakout", "mean-reversion"],
};

// Configuration schema for UI
export const configSchema = {
  period: {
    type: "number" as const,
    label: "Period",
    default: 40,
    min: 10,
    max: 200,
    description: "Lookback period for volatility and breakout detection",
  },
};

// ---------------- helpers ----------------
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  // @ts-expect-error - TypeScript doesn't infer that mid-1 is safe when a.length > 1
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function highest(xs: number[]) {
  return xs.reduce((m, x) => (x > m ? x : m), -Infinity);
}

function lowest(xs: number[]) {
  return xs.reduce((m, x) => (x < m ? x : m), Infinity);
}

function trueRange(curr: StrategyBar, prev: StrategyBar) {
  const hl = curr.high - curr.low;
  const hc = Math.abs(curr.high - prev.close);
  const lc = Math.abs(curr.low - prev.close);
  return Math.max(hl, hc, lc);
}

function atr(bars: ReadonlyArray<StrategyBar>, endIndex: number, length: number) {
  const start = endIndex - length + 1;
  if (start <= 0) return 0;
  const trs: number[] = [];
  for (let i = start; i <= endIndex; i++) trs.push(trueRange(bars[i], bars[i - 1]));
  return mean(trs);
}

function rsi(bars: ReadonlyArray<StrategyBar>, endIndex: number, length: number) {
  const start = endIndex - length;
  if (start < 0) return 50;

  let gains = 0;
  let losses = 0;
  for (let i = start + 1; i <= endIndex; i++) {
    const ch = bars[i].close - bars[i - 1].close;
    if (ch >= 0) gains += ch;
    else losses += -ch;
  }
  const avgGain = gains / length;
  const avgLoss = losses / length;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Fractal energy-ish: higher => more choppy/coil-like
function fractalEnergy(bars: ReadonlyArray<StrategyBar>, endIndex: number, length: number) {
  const start = endIndex - length + 1;
  if (start < 0) return 1;

  let path = 0;
  for (let i = start + 1; i <= endIndex; i++) {
    path += Math.abs(bars[i].close - bars[i - 1].close);
  }
  const net = Math.abs(bars[endIndex].close - bars[start].close);
  if (path === 0) return 1;
  return clamp(1 - net / path, 0, 1);
}

function getTimestamp(bar: any) {
  return bar.timestamp ?? bar.time ?? bar.t ?? Date.now();
}

// ---------------- strategy ----------------
export function createStrategy(config: StrategyConfig) {
  // Track bars manually in closure
  const history: StrategyBar[] = [];

  // Small anti-spam cooldown
  const cooldownBars = 5;
  let lastSignalIndex = -999999;

  return {
    onInit(context: any) {
      // reset state when backtest starts
      history.length = 0;
      lastSignalIndex = -999999;

      // optional logging if your runtime supports it
      // context?.log?.info?.("coil-pulse-reverter init");
    },

    onStop(context: any) {
      // optional: emit summary or cleanup
      // context?.log?.info?.(`stopped after ${history.length} bars`);
    },

    onBar(context: any, bar: StrategyBar): StrategySignal | null {
      history.push(bar);
      const index = history.length - 1;

      const L = Math.max(10, Math.floor(config.period || 40));
      if (index < L + 20) return null;

      if (index - lastSignalIndex < cooldownBars) return null;

      const ts = getTimestamp(bar);

      // ---- regime metrics ----
      const atrFast = atr(history, index, 14);
      const atrSlowSeries: number[] = [];
      for (let i = index - L + 1; i <= index; i++) atrSlowSeries.push(atr(history, i, 14));
      const atrMedian = median(atrSlowSeries);

      const compression = atrMedian > 0 ? atrFast / atrMedian : 1;

      const fe = fractalEnergy(history, index, L);

      const candleRangePct = bar.close !== 0 ? (bar.high - bar.low) / bar.close : 0;

      // volume z-score (if volume exists)
      const vols = history.slice(index - L + 1, index + 1).map((b: any) => Number(b.volume ?? 0));
      const vNow = Number((bar as any).volume ?? 0);
      const vZ = stdev(vols) > 0 ? (vNow - mean(vols)) / stdev(vols) : 0;

      // breakout rails (previous L bars)
      const highs = history.slice(index - L, index).map((b) => b.high);
      const lows = history.slice(index - L, index).map((b) => b.low);
      const HH = highest(highs);
      const LL = lowest(lows);

      // RSI + ATR bands for panic revert
      const r = rsi(history, index, 14);
      const upper = bar.close + 1.8 * atrFast;
      const lower = bar.close - 1.8 * atrFast;

      // ---- Mode A: COIL → PULSE breakout ----
      const isCoil = compression < 0.85 && fe > 0.55 && candleRangePct < 0.006; // tweak if too strict/loose

      const breakoutUp = bar.close > HH * 1.001;
      const breakoutDn = bar.close < LL * 0.999;

      if (isCoil) {
        const volConfirm = vZ > 1.0 || vNow === 0; // if no volume data, don't block

        if (breakoutUp && volConfirm && r > 52) {
          lastSignalIndex = index;
          return {
            side: "buy",
            timestamp: ts,
            reason: `COIL→PULSE: comp=${compression.toFixed(2)} fe=${fe.toFixed(
              2,
            )} >HH volZ=${vZ.toFixed(2)} rsi=${r.toFixed(1)}`,
          } as any;
        }

        if (breakoutDn && volConfirm && r < 48) {
          lastSignalIndex = index;
          return {
            side: "sell",
            timestamp: ts,
            reason: `COIL→PULSE: comp=${compression.toFixed(2)} fe=${fe.toFixed(
              2,
            )} <LL volZ=${vZ.toFixed(2)} rsi=${r.toFixed(1)}`,
          } as any;
        }

        return null;
      }

      // ---- Mode B: PANIC REVERT (high vol) ----
      const isPanic = compression > 1.25;

      if (isPanic) {
        if (r < 26 && bar.low < lower) {
          lastSignalIndex = index;
          return {
            side: "buy",
            timestamp: ts,
            reason: `PANIC-REVERT BUY: comp=${compression.toFixed(2)} rsi=${r.toFixed(1)} low<band`,
          } as any;
        }

        if (r > 74 && bar.high > upper) {
          lastSignalIndex = index;
          return {
            side: "sell",
            timestamp: ts,
            reason: `PANIC-REVERT SELL: comp=${compression.toFixed(
              2,
            )} rsi=${r.toFixed(1)} high>band`,
          } as any;
        }
      }

      return null;
    },
  };
}
