import type {
  BacktestRequest,
  BacktestResult,
  MetricKey,
  DataRequest,
} from "@crucible-trader/sdk";

import type { Bar, BarsBySymbol, EquityPoint, EngineDiagnostics, TradeFill } from "./types.js";

const DEFAULT_SEED = 42;
const REQUIRED_METRICS: MetricKey[] = ["sharpe", "sortino", "max_dd", "cagr", "winrate"];

type StrategyParams = Record<string, unknown>;

/**
 * Deterministic linear congruential generator.
 */
const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

/**
 * Extracts user-supplied bar data from the backtest request.
 */
const extractBars = (req: BacktestRequest): BarsBySymbol => {
  const params = (req.strategy?.params ?? {}) as StrategyParams;
  const rawBars = params.bars ?? params.__bars;

  if (isBarsBySymbol(rawBars)) {
    return Object.fromEntries(
      Object.entries(rawBars).map(([symbol, bars]) => [symbol, sanitizeBars(bars)]),
    );
  }

  if (Array.isArray(rawBars)) {
    const firstSymbol = req.data[0]?.symbol ?? "primary";
    return { [firstSymbol]: sanitizeBars(rawBars) };
  }

  return {};
};

const isBarsBySymbol = (value: unknown): value is BarsBySymbol => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every((bars) =>
    Array.isArray(bars) ? bars.every(isBar) : false,
  );
};

const sanitizeBars = (bars: ReadonlyArray<unknown>): Bar[] => {
  return bars.filter(isBar);
};

const isBar = (value: unknown): value is Bar => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const bar = value as Record<string, unknown>;

  return (
    typeof bar.timestamp === "string" &&
    typeof bar.open === "number" &&
    typeof bar.high === "number" &&
    typeof bar.low === "number" &&
    typeof bar.close === "number" &&
    typeof bar.volume === "number"
  );
};

const normaliseMetrics = (metrics?: MetricKey[]): MetricKey[] => {
  if (!metrics || metrics.length === 0) {
    return REQUIRED_METRICS;
  }

  const deduped = Array.from(new Set(metrics));

  return REQUIRED_METRICS.filter((metric) => deduped.includes(metric));
};

const makeRunId = (request: BacktestRequest, seed: number): string => {
  const slug = request.runName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.length > 0 ? `${slug}-${seed.toString(36)}` : `run-${seed.toString(36)}`;
};

/**
 * Executes a deterministic backtest over the supplied bar data.
 */
export async function runBacktest(request: BacktestRequest): Promise<BacktestResult> {
  const seed = Number.isInteger(request.seed) ? (request.seed as number) : DEFAULT_SEED;
  const rng = createRng(seed);
  const barsBySymbol = extractBars(request);
  const metrics = normaliseMetrics(request.metrics);

  const equityCurve: EquityPoint[] = [];
  const trades: TradeFill[] = [];
  let processedBars = 0;

  for (const dataRequest of request.data) {
    const symbolBars = barsBySymbol[dataRequest.symbol] ?? [];
    const symbolTrades = iterateSymbolBars(dataRequest, symbolBars, rng, equityCurve, request);
    trades.push(...symbolTrades);
    processedBars += symbolBars.length;
  }

  const runId = makeRunId(request, seed);
  const artifactsBase = `storage/runs/${runId}`;
  const summary = buildSummary();
  const diagnostics: EngineDiagnostics = {
    seed,
    processedBars,
    equityCurve,
    trades,
    requestedMetrics: metrics,
  };

  // TODO[phase-0-next] Emit parquet and report artifacts when persistence layer is ready.
  return {
    runId,
    summary,
    artifacts: {
      equityParquet: `${artifactsBase}/equity.parquet`,
      tradesParquet: `${artifactsBase}/trades.parquet`,
      barsParquet: `${artifactsBase}/bars.parquet`,
    },
    diagnostics: {
      ...diagnostics,
      notes: "Phase 0 stub result. Parquet emission TODO[phase-0-next].",
    },
  };
}

const iterateSymbolBars = (
  request: DataRequest,
  bars: ReadonlyArray<Bar>,
  rng: () => number,
  equityCurve: EquityPoint[],
  fullRequest: BacktestRequest,
): TradeFill[] => {
  const trades: TradeFill[] = [];
  if (bars.length === 0) {
    return trades;
  }

  let equity = fullRequest.initialCash;
  bars.forEach((bar, idx) => {
    // Deterministic tiny drift to prove iteration without changing metrics.
    const direction = idx % 2 === 0 ? 1 : -1;
    const delta = direction * 0.0001 * rng() * fullRequest.initialCash;
    equity += delta;
    equityCurve.push({
      timestamp: bar.timestamp,
      equity,
    });

    if (idx % Math.max(1, Math.floor(bars.length / 3)) === 0) {
      trades.push({
        id: `${request.symbol}-${idx}`,
        symbol: request.symbol,
        side: idx % 2 === 0 ? "buy" : "sell",
        quantity: 1,
        price: bar.close,
        timestamp: bar.timestamp,
      });
    }
  });

  return trades;
};

const buildSummary = (): Record<string, number> => ({
  sharpe: 0,
  max_dd: 0,
  cagr: 0,
});
