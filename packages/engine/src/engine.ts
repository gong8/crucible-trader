import type {
  BacktestRequest,
  BacktestResult,
  MetricKey,
  DataRequest,
} from "@crucible-trader/sdk";
import { CsvSource } from "@crucible-trader/data";
import { calculateMetricsSummary } from "@crucible-trader/metrics";
import { join } from "node:path";

import type { Bar, BarsBySymbol, EquityPoint, EngineDiagnostics, TradeFill } from "./types.js";
import { writeParquetArtifacts } from "./persistence.js";

const DEFAULT_SEED = 42;
const REQUIRED_METRICS: MetricKey[] = ["sharpe", "sortino", "max_dd", "cagr", "winrate"];
const FALLBACK_METRICS: MetricKey[] = ["sharpe", "sortino", "max_dd", "cagr"];

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

const csvSource = new CsvSource();

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
  const barsBySymbol = await loadBarsBySymbol(request);
  const metrics = normaliseMetrics(request.metrics);

  const equityCurve: EquityPoint[] = [];
  const trades: TradeFill[] = [];
  let processedBars = 0;
  const barsForArtifacts: Bar[] = [];

  for (const dataRequest of request.data) {
    const symbolBars = barsBySymbol[dataRequest.symbol] ?? [];
    barsForArtifacts.push(...symbolBars);
    const symbolTrades = iterateSymbolBars(dataRequest, symbolBars, rng, equityCurve, request);
    trades.push(...symbolTrades);
    processedBars += symbolBars.length;
  }

  const runId = makeRunId(request, seed);
  const artifactsRelative = `storage/runs/${runId}`;
  const runDirFilesystem = join(process.cwd(), "storage", "runs", runId);
  const summary = buildSummary(metrics, equityCurve);
  const diagnostics: EngineDiagnostics = {
    seed,
    processedBars,
    equityCurve,
    trades,
    requestedMetrics: metrics,
  };

  const dedupedBars = dedupeBars(barsForArtifacts);
  await writeParquetArtifacts(runDirFilesystem, {
    equity: equityCurve.map((point) => ({
      time: point.timestamp,
      equity: point.equity,
    })),
    trades: trades.map((trade) => ({
      time: trade.timestamp,
      side: trade.side,
      qty: trade.quantity,
      price: trade.price,
      pnl: trade.pnl,
    })),
    bars: dedupedBars.map((bar) => ({
      time: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })),
  });

  return {
    runId,
    summary,
    artifacts: {
      equityParquet: `${artifactsRelative}/equity.parquet`,
      tradesParquet: `${artifactsRelative}/trades.parquet`,
      barsParquet: `${artifactsRelative}/bars.parquet`,
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
        pnl: 0,
      });
    }
  });

  return trades;
};

const buildSummary = (
  metrics: ReadonlyArray<MetricKey>,
  equityCurve: ReadonlyArray<EquityPoint>,
): Record<string, number> => {
  const results = calculateMetricsSummary(equityCurve);
  const summary: Record<string, number> = {};

  const metricSet = metrics.length > 0 ? metrics : FALLBACK_METRICS;

  for (const metric of metricSet) {
    switch (metric) {
      case "sharpe":
        summary.sharpe = results.sharpe;
        break;
      case "sortino":
        summary.sortino = results.sortino;
        break;
      case "max_dd":
        summary.max_dd = results.maxDrawdown;
        break;
      case "cagr":
        summary.cagr = results.cagr;
        break;
      case "winrate":
        summary.winrate = 0;
        break;
      default:
        summary[metric] = 0;
    }
  }

  if (!("sharpe" in summary)) {
    summary.sharpe = results.sharpe;
  }
  if (!("max_dd" in summary)) {
    summary.max_dd = results.maxDrawdown;
  }
  if (!("cagr" in summary)) {
    summary.cagr = results.cagr;
  }

  return summary;
};

const dedupeBars = (bars: ReadonlyArray<Bar>): Bar[] => {
  const map = new Map<string, Bar>();
  for (const bar of bars) {
    map.set(bar.timestamp, bar);
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

const loadBarsBySymbol = async (req: BacktestRequest): Promise<BarsBySymbol> => {
  const bars: BarsBySymbol = extractFallbackBars(req);

  for (const dataRequest of req.data) {
    if (dataRequest.source === "csv") {
      try {
        bars[dataRequest.symbol] = await csvSource.loadBars(dataRequest);
      } catch {
        bars[dataRequest.symbol] = bars[dataRequest.symbol] ?? [];
      }
    } else if (!bars[dataRequest.symbol]) {
      bars[dataRequest.symbol] = [];
    }
  }

  return bars;
};

const extractFallbackBars = (req: BacktestRequest): BarsBySymbol => {
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
