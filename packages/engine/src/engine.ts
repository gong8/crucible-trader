import type { BacktestRequest, BacktestResult, MetricKey, RiskProfile } from "@crucible-trader/sdk";
import { strategies, Schemas, assertValid } from "@crucible-trader/sdk";
import { CsvSource, PolygonSource, TiingoSource } from "@crucible-trader/data";
import { calculateMetricsSummary } from "@crucible-trader/metrics";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Bar, BarsBySymbol, EquityPoint, EngineDiagnostics, TradeFill } from "./types.js";
import { writeParquetArtifacts, writeReportArtifact } from "./persistence.js";
import { loadCustomStrategies } from "./customStrategyLoader.js";

export interface RunBacktestOptions {
  readonly runId?: string;
  readonly riskProfile?: RiskProfile;
}

const DEFAULT_SEED = 42;
const REQUIRED_METRICS: MetricKey[] = ["sharpe", "sortino", "max_dd", "cagr", "winrate"];
const FALLBACK_METRICS: MetricKey[] = ["sharpe", "sortino", "max_dd", "cagr", "total_pnl"];
const DEFAULT_RISK_PROFILE: RiskProfile = {
  id: "default",
  name: "phase-0-guardrails",
  maxDailyLossPct: 0.03,
  maxPositionPct: 0.2,
  perOrderCapPct: 0.1,
  globalDDKillPct: 0.05,
  cooldownMinutes: 15,
};

type StrategyModule = (typeof strategies)[keyof typeof strategies];

type StrategyParams = Record<string, unknown>;

interface EngineRiskLimits {
  readonly maxDailyLossPct: number;
  readonly maxPositionPct: number;
  readonly perOrderCapPct: number;
  readonly killSwitchDrawdownPct: number;
}

interface PositionState {
  quantity: number;
  averagePrice: number;
  realizedPnl: number;
}

const csvSource = new CsvSource();
const tiingoSource = new TiingoSource();
const polygonSource = new PolygonSource();
const ENGINE_MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const needsExtraAscend = ENGINE_MODULE_DIR.includes(`${sep}dist-test${sep}`);
const ascenders = needsExtraAscend ? ["..", "..", "..", ".."] : ["..", "..", ".."];
const ENGINE_REPO_ROOT = join(ENGINE_MODULE_DIR, ...ascenders);
const RUNS_OUTPUT_ROOT = join(ENGINE_REPO_ROOT, "storage", "runs");
// Initialize with preset strategies
const STRATEGY_REGISTRY: Record<string, StrategyModule> = {
  [strategies.smaCrossover.name]: strategies.smaCrossover,
  [strategies.momentum.name]: strategies.momentum,
  [strategies.meanReversion.name]: strategies.meanReversion,
  [strategies.breakout.name]: strategies.breakout,
  [strategies.chaosTrader.name]: strategies.chaosTrader,
};

// Load custom strategies (async initialization)
let customStrategiesLoaded = false;
const customStrategiesPromise = loadCustomStrategies()
  .then((customStrategies) => {
    Object.assign(STRATEGY_REGISTRY, customStrategies);
    customStrategiesLoaded = true;
    return customStrategies;
  })
  .catch((error) => {
    console.error("Failed to load custom strategies:", error);
    return {};
  });

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
  const requested = metrics ? Array.from(new Set(metrics)) : [];
  const combined = [...REQUIRED_METRICS];
  for (const metric of requested) {
    if (!combined.includes(metric)) {
      combined.push(metric);
    }
  }
  return combined;
};

const makeRunId = (request: BacktestRequest, seed: number): string => {
  const slug = request.runName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]+/g, "")
    .slice(0, 14);
  const suffix = seed.toString(36);
  const base = slug.length > 0 ? slug : "run";
  return `${base}-${timestamp}-${suffix}`;
};

const resolveRiskLimits = (profile?: RiskProfile): EngineRiskLimits => {
  const source = profile ?? DEFAULT_RISK_PROFILE;
  return {
    maxDailyLossPct: Math.max(source.maxDailyLossPct, 0),
    maxPositionPct: Math.max(source.maxPositionPct, 0.05),
    perOrderCapPct: Math.max(source.perOrderCapPct, 0.02),
    killSwitchDrawdownPct: Math.max(source.globalDDKillPct, 0.01),
  };
};

/**
 * Executes a deterministic backtest over the supplied bar data.
 */
export async function runBacktest(
  request: BacktestRequest,
  options: RunBacktestOptions = {},
): Promise<BacktestResult> {
  // Ensure custom strategies are loaded
  if (!customStrategiesLoaded) {
    await customStrategiesPromise;
  }

  // Validate request structure and constraints
  assertValid(Schemas.BacktestRequest, request, "BacktestRequest");

  const seed = Number.isInteger(request.seed) ? (request.seed as number) : DEFAULT_SEED;
  const barsBySymbol = await loadBarsBySymbol(request);
  const metrics = normaliseMetrics(request.metrics);

  const equityCurve: EquityPoint[] = [];
  const trades: TradeFill[] = [];
  const barsForArtifacts: Bar[] = [];
  const primaryRequest = request.data[0];
  const runId = options.runId ?? makeRunId(request, seed);
  const artifactsRelative = `storage/runs/${runId}`;
  const runDirFilesystem = join(RUNS_OUTPUT_ROOT, runId);

  if (!primaryRequest) {
    throw new Error("BacktestRequest must include at least one data series");
  }

  for (const dataRequest of request.data) {
    const symbolBars = barsBySymbol[dataRequest.symbol] ?? [];
    barsForArtifacts.push(...symbolBars);
  }

  const primaryBars = barsBySymbol[primaryRequest.symbol] ?? [];

  if (primaryBars.length === 0) {
    throw new Error(
      `No bars loaded for ${primaryRequest.symbol} ${primaryRequest.timeframe}. ` +
        `Please ensure the data file exists at storage/datasets/${primaryRequest.symbol.toLowerCase()}_${primaryRequest.timeframe}.csv`,
    );
  }

  const strategy = instantiateStrategy(request);
  const riskLimits = resolveRiskLimits(options.riskProfile);
  const simulation = simulateStrategy({
    bars: primaryBars,
    strategy,
    request,
    riskLimits,
  });

  equityCurve.push(...simulation.equityCurve);
  trades.push(...simulation.trades);

  const summary = buildSummary(metrics, equityCurve, trades);
  const diagnostics: EngineDiagnostics = {
    seed,
    processedBars: simulation.processedBars,
    equityCurve,
    trades,
    requestedMetrics: metrics,
    runName: request.runName,
    riskProfileId: options.riskProfile?.id ?? DEFAULT_RISK_PROFILE.id,
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
      fees: trade.fees,
      reason: trade.reason,
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

  const reportRelativePath = `${artifactsRelative}/report.md`;
  await writeReportArtifact(runDirFilesystem, {
    runName: request.runName,
    summary,
    trades,
    riskProfile: options.riskProfile ?? DEFAULT_RISK_PROFILE,
  });

  return {
    runId,
    summary,
    artifacts: {
      equityParquet: `${artifactsRelative}/equity.parquet`,
      tradesParquet: `${artifactsRelative}/trades.parquet`,
      barsParquet: `${artifactsRelative}/bars.parquet`,
      reportMd: reportRelativePath,
    },
    diagnostics: {
      ...diagnostics,
      notes: "Phase 0 deterministic run",
    },
  };
}

const instantiateStrategy = (request: BacktestRequest) => {
  const module = STRATEGY_REGISTRY[request.strategy.name];
  if (!module) {
    throw new Error(`Unknown strategy "${request.strategy.name}"`);
  }
  const params = module.schema.parse(request.strategy.params);
  const strategy = module.factory(params as never);
  return strategy;
};

const buildSummary = (
  metrics: ReadonlyArray<MetricKey>,
  equityCurve: ReadonlyArray<EquityPoint>,
  trades: ReadonlyArray<TradeFill>,
): Record<string, number> => {
  const results = calculateMetricsSummary(equityCurve);
  const winRate = computeWinRate(trades);
  const profitFactor = computeProfitFactor(trades);
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
        summary.winrate = winRate;
        break;
      case "total_pnl":
        summary.total_pnl = results.totalPnl;
        break;
      case "total_return":
        summary.total_return = results.totalReturn;
        break;
      case "num_trades":
        summary.num_trades = trades.length;
        break;
      case "profit_factor":
        summary.profit_factor = profitFactor;
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
  if (!("total_pnl" in summary)) {
    summary.total_pnl = results.totalPnl;
  }
  if (!("total_return" in summary)) {
    summary.total_return = results.totalReturn;
  }
  if (!("num_trades" in summary)) {
    summary.num_trades = trades.length;
  }
  if (metrics.includes("winrate") && !("winrate" in summary)) {
    summary.winrate = winRate;
  }

  return summary;
};

const computeWinRate = (trades: ReadonlyArray<TradeFill>): number => {
  if (trades.length === 0) {
    return 0;
  }
  const winners = trades.filter((trade) => trade.pnl > 0).length;
  return winners / trades.length;
};

const computeProfitFactor = (trades: ReadonlyArray<TradeFill>): number => {
  if (trades.length === 0) {
    return 0;
  }
  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));

  if (grossLoss === 0) {
    return grossProfit > 0 ? Infinity : 0;
  }

  return grossProfit / grossLoss;
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
    const symbol = dataRequest.symbol;
    let loaded = false;
    try {
      const csvBars = await csvSource.loadBars(dataRequest);
      if (csvBars.length > 0) {
        bars[symbol] = csvBars;
        loaded = true;
      }
    } catch {
      // ignore missing csv datasets here; fall back to remote sources below
    }

    if (loaded) {
      continue;
    }

    if (dataRequest.source === "tiingo") {
      bars[symbol] = await tiingoSource.loadBars(dataRequest);
      continue;
    }

    if (dataRequest.source === "polygon") {
      bars[symbol] = await polygonSource.loadBars(dataRequest);
      continue;
    }

    if (dataRequest.source === "auto") {
      try {
        bars[symbol] = await tiingoSource.loadBars(dataRequest);
        continue;
      } catch {
        /* swallow and try polygon */
      }
      try {
        bars[symbol] = await polygonSource.loadBars(dataRequest);
        continue;
      } catch {
        /* fall through */
      }
    }

    if (!bars[symbol]) {
      bars[symbol] = [];
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

interface SimulationArgs {
  readonly bars: ReadonlyArray<Bar>;
  readonly strategy: ReturnType<StrategyModule["factory"]>;
  readonly request: BacktestRequest;
  readonly riskLimits: EngineRiskLimits;
}

interface SimulationResult {
  readonly equityCurve: EquityPoint[];
  readonly trades: TradeFill[];
  readonly processedBars: number;
}

const simulateStrategy = ({
  bars,
  strategy,
  request,
  riskLimits,
}: SimulationArgs): SimulationResult => {
  const equityCurve: EquityPoint[] = [];
  const trades: TradeFill[] = [];
  const position: PositionState = {
    quantity: 0,
    averagePrice: 0,
    realizedPnl: 0,
  };
  const cashRef = { value: request.initialCash };
  let peakEquity = request.initialCash;
  const symbol = request.data[0]?.symbol ?? "primary";
  const context = { symbol };
  strategy.onInit(context);
  const feeRate = (request.costs.feeBps + request.costs.slippageBps) / 10_000;

  for (const bar of bars) {
    const signal = strategy.onBar(context, bar);
    const equityBefore = cashRef.value + position.quantity * bar.close;

    if (signal) {
      executeSignal({
        symbol,
        signalReason: signal.reason,
        side: signal.side,
        timestamp: bar.timestamp,
        price: bar.close,
        position,
        cashRef,
        trades,
        equity: equityBefore,
        feeRate,
        riskLimits,
      });
    }

    const equity = cashRef.value + position.quantity * bar.close;
    peakEquity = Math.max(peakEquity, equity);
    equityCurve.push({ timestamp: bar.timestamp, equity });

    const drawdown = peakEquity > 0 ? (equity - peakEquity) / peakEquity : 0;
    if (Math.abs(drawdown) >= riskLimits.killSwitchDrawdownPct) {
      break;
    }

    if (equity <= request.initialCash * (1 - riskLimits.maxDailyLossPct)) {
      break;
    }
  }

  const closingSignal = strategy.onStop(context);
  if (closingSignal && closingSignal.side === "sell" && position.quantity > 0) {
    executeSignal({
      symbol,
      signalReason: closingSignal.reason ?? "strategy_stop",
      side: closingSignal.side,
      timestamp: bars[bars.length - 1]?.timestamp ?? new Date().toISOString(),
      price: bars[bars.length - 1]?.close ?? 0,
      position,
      cashRef,
      trades,
      equity: cashRef.value + position.quantity * (bars[bars.length - 1]?.close ?? 0),
      feeRate,
      riskLimits,
    });
  }

  const processedBars = equityCurve.length;

  return {
    equityCurve,
    trades,
    processedBars,
  };
};

interface ExecuteSignalArgs {
  readonly symbol: string;
  readonly signalReason: string;
  readonly side: "buy" | "sell";
  readonly timestamp: string;
  readonly price: number;
  readonly position: PositionState;
  readonly cashRef: { value: number };
  readonly trades: TradeFill[];
  readonly equity: number;
  readonly feeRate: number;
  readonly riskLimits: EngineRiskLimits;
}

const executeSignal = ({
  symbol,
  signalReason,
  side,
  timestamp,
  price,
  position,
  cashRef,
  trades,
  equity,
  feeRate,
  riskLimits,
}: ExecuteSignalArgs): void => {
  if (price <= 0) {
    return;
  }

  const maxPositionValue = equity * riskLimits.maxPositionPct;
  const orderCapValue = equity * riskLimits.perOrderCapPct;
  const maxPositionQty = Math.max(0, Math.floor(maxPositionValue / price));
  const maxOrderQty = Math.max(1, Math.floor(orderCapValue / price));

  const desiredQty = side === "buy" ? maxPositionQty : 0;
  let delta = desiredQty - position.quantity;

  if (delta === 0) {
    return;
  }

  if (delta > maxOrderQty) {
    delta = maxOrderQty;
  }
  if (delta < -maxOrderQty) {
    delta = -maxOrderQty;
  }
  if (side === "sell") {
    delta = Math.max(-position.quantity, delta);
  }

  if (delta > 0) {
    const affordableQty = Math.floor(cashRef.value / price);
    if (affordableQty <= 0) {
      return;
    }
    if (delta > affordableQty) {
      delta = affordableQty;
    }
  }

  if (delta === 0) {
    return;
  }

  const tradeId = `${symbol}-${side}-${timestamp}-${trades.length + 1}`;
  if (delta > 0) {
    const cost = delta * price;
    const fees = cost * feeRate;
    cashRef.value -= cost + fees;
    const newTotalCost = position.averagePrice * position.quantity + cost;
    position.quantity += delta;
    position.averagePrice = position.quantity > 0 ? newTotalCost / position.quantity : 0;
    trades.push({
      id: tradeId,
      symbol,
      side,
      quantity: delta,
      price,
      timestamp,
      pnl: 0,
      fees,
      reason: signalReason,
    });
    return;
  }

  const qtyToClose = Math.min(-delta, position.quantity);
  const proceeds = qtyToClose * price;
  const fees = proceeds * feeRate;
  cashRef.value += proceeds - fees;
  const realized = qtyToClose * (price - position.averagePrice);
  position.quantity -= qtyToClose;
  if (position.quantity === 0) {
    position.averagePrice = 0;
  }
  position.realizedPnl += realized;
  trades.push({
    id: tradeId,
    symbol,
    side,
    quantity: qtyToClose,
    price,
    timestamp,
    pnl: realized,
    fees,
    reason: signalReason,
  });
};
