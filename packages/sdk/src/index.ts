// Source of truth for request/response shapes used across Crucible Trader.
// Mirrors docs/spec/00-master-spec.txt (Phase 0) — “typed interfaces (llm-friendly, stable)”.

import { z } from "zod";

/** -----------------------------------------------------------------------
 *  Shared enums & primitives
 *  -------------------------------------------------------------------- */

/** Represents supported data vendors for time series ingestion. */
export type DataSource = "auto" | "csv" | "tiingo" | "polygon";

/** Allowed bar intervals for Phase 0/1 usage. Extend in later phases. */
export type Timeframe = "1d" | "1h" | "15m" | "1m";

/** Metric identifiers aligned with Phase 0 reporting. */
export type MetricKey =
  | "sharpe"
  | "sortino"
  | "max_dd"
  | "cagr"
  | "winrate"
  | "total_pnl"
  | "total_return"
  | "num_trades"
  | "profit_factor";

/** ISO-8601 date string (UTC recommended). */
export type ISODate = string;

/** -----------------------------------------------------------------------
 *  DataRequest
 *  -------------------------------------------------------------------- */

/**
 * Request for a single time series (symbol, timeframe, date range).
 * For equities Phase 1, “tiingo” is the default vendor for EOD.
 */
export interface DataRequest {
  /** Vendor identifier such as csv, tiingo, or polygon. */
  source: DataSource;
  /** Instrument symbol (e.g., "AAPL"). */
  symbol: string;
  /** Bar interval specifying aggregation size. */
  timeframe: Timeframe;
  /** Inclusive start date (e.g., "2022-01-01"). */
  start: ISODate;
  /** Inclusive end date (e.g., "2024-12-31"). */
  end: ISODate;
  /** When true, request adjusted OHLC data if the vendor supports it. */
  adjusted?: boolean;
}

/** Runtime validator for {@link DataRequest}. */
export const DataRequestSchema = z.object({
  source: z.enum(["auto", "csv", "tiingo", "polygon"]),
  symbol: z.string().min(1),
  timeframe: z.enum(["1d", "1h", "15m", "1m"]),
  start: z.string().min(1),
  end: z.string().min(1),
  adjusted: z.boolean().optional(),
});

/** -----------------------------------------------------------------------
 *  BacktestRequest
 *  -------------------------------------------------------------------- */

/**
 * Full definition of a single backtest run submitted to the engine.
 * - `runName` is user defined and surfaces in manifests and the UI.
 * - `data` supports multiple instruments for multi-symbol strategies.
 * - `strategy.params` remains opaque; individual strategy modules validate.
 */
export interface BacktestRequest {
  /** Human readable name that appears in manifests and UI. */
  runName: string;
  /** Series to load prior to simulation. */
  data: DataRequest[];
  /** Strategy module identifier and untyped parameter payload. */
  strategy: {
    /** Strategy slug (e.g., "sma_crossover"). */
    name: string;
    /** Strategy specific parameters validated downstream. */
    params: Record<string, unknown>;
  };
  /** Trading cost assumptions expressed in basis points. */
  costs: {
    /** Exchange or broker fee in basis points. */
    feeBps: number;
    /** Slippage model in basis points. */
    slippageBps: number;
  };
  /** Starting equity for the simulation. */
  initialCash: number;
  /** Optional RNG seed to enforce deterministic behaviour. */
  seed?: number;
  /** Metrics requested for reporting; defaults to the canonical set. */
  metrics?: MetricKey[];
  /** Optional link to a saved risk profile. */
  riskProfileId?: string;
}

/** Runtime validator for {@link BacktestRequest}. */
export const BacktestRequestSchema = z.object({
  runName: z.string().min(1),
  data: z.array(DataRequestSchema).min(1),
  strategy: z.object({
    name: z.string().min(1),
    params: z.record(z.any()),
  }),
  costs: z.object({
    feeBps: z.number().nonnegative(),
    slippageBps: z.number().nonnegative(),
  }),
  initialCash: z.number().positive(),
  seed: z.number().int().optional(),
  metrics: z
    .array(
      z.enum([
        "sharpe",
        "sortino",
        "max_dd",
        "cagr",
        "winrate",
        "total_pnl",
        "total_return",
        "num_trades",
        "profit_factor",
      ]),
    )
    .optional(),
  riskProfileId: z.string().min(1).optional(),
});

/** -----------------------------------------------------------------------
 *  BacktestResult
 *  -------------------------------------------------------------------- */

/**
 * Canonical output artifact of a completed backtest run.
 * Artifacts reference files relative to the repository root.
 */
export interface BacktestResult {
  /** Unique identifier for the run (e.g., timestamp slug). */
  runId: string;
  /** Metrics summary keyed by metric identifier. */
  summary: Record<string, number>;
  /** File paths to generated artifacts. */
  artifacts: {
    /** Path to the equity curve parquet file. */
    equityParquet: string;
    /** Path to the trades parquet file. */
    tradesParquet: string;
    /** Path to the bars parquet file. */
    barsParquet: string;
    /** Optional markdown report path. */
    reportMd?: string;
  };
  /** Diagnostics metadata such as seeds, versions, and invariants. */
  diagnostics: Record<string, unknown>;
}

/** Runtime validator for {@link BacktestResult}. */
export const BacktestResultSchema = z.object({
  runId: z.string().min(1),
  summary: z.record(z.number()),
  artifacts: z.object({
    equityParquet: z.string().min(1),
    tradesParquet: z.string().min(1),
    barsParquet: z.string().min(1),
    reportMd: z.string().min(1).optional(),
  }),
  diagnostics: z.record(z.unknown()),
});

/** -----------------------------------------------------------------------
 *  RiskProfile
 *  -------------------------------------------------------------------- */

/**
 * Editable risk controls used for live and simulation pre-checks.
 * Defaults reflect spec guidance (3% daily loss, 20% position, etc.).
 */
export interface RiskProfile {
  /** Stable identifier for referencing the profile. */
  id: string;
  /** Human readable display name. */
  name: string;
  /** Max allowed daily loss as a fraction (0.03 for 3%). */
  maxDailyLossPct: number;
  /** Max allowed open position size as a fraction of equity. */
  maxPositionPct: number;
  /** Per-order cap expressed as a fraction of equity. */
  perOrderCapPct: number;
  /** Global kill switch drawdown threshold. */
  globalDDKillPct: number;
  /** Cooldown period in minutes before resuming trading. */
  cooldownMinutes: number;
}

/** Runtime validator for {@link RiskProfile}. */
export const RiskProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  maxDailyLossPct: z.number().min(0),
  maxPositionPct: z.number().min(0),
  perOrderCapPct: z.number().min(0),
  globalDDKillPct: z.number().min(0),
  cooldownMinutes: z.number().int().nonnegative(),
});

/** -----------------------------------------------------------------------
 *  Helper: runtime assertion using zod
 *  -------------------------------------------------------------------- */

/**
 * Validates the supplied payload against the provided schema.
 *
 * @param schema - Zod schema used for validation.
 * @param value - Candidate payload to validate.
 * @param label - Descriptive label for error reporting.
 * @returns The validated payload typed as {@link T}.
 * @throws Error when validation fails.
 */
export function assertValid<T>(schema: z.ZodType<T>, value: unknown, label = "payload"): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    });
    throw new Error(`Invalid ${label}: ${issues.join("; ")}`);
  }
  return parsed.data;
}

/** -----------------------------------------------------------------------
 *  Re-exports grouped for convenience
 *  -------------------------------------------------------------------- */

/** Namespaced access to the primary schemas. */
/** -----------------------------------------------------------------------
 *  OptimizationRequest
 *  -------------------------------------------------------------------- */

/**
 * Parameter range specification for grid search optimization.
 * Each param can be a discrete list or a range specification.
 */
export type ParamRange = number[] | { min: number; max: number; step: number };

/**
 * Parameter grid for optimization.
 * Keys are parameter names, values are ranges to explore.
 */
export type ParamGrid = Record<string, ParamRange>;

/**
 * Request to run a grid search optimization for a strategy.
 */
export interface OptimizationRequest {
  /** Human readable name for the optimization job. */
  name: string;
  /** Base backtest configuration to optimize. */
  baseRequest: Omit<BacktestRequest, "strategy">;
  /** Strategy to optimize. */
  strategy: {
    /** Strategy slug (e.g., "sma_crossover"). */
    name: string;
  };
  /** Parameter grid to search over. */
  paramGrid: ParamGrid;
  /** Objective metric to optimize (e.g., "sharpe", "sortino"). */
  objective: MetricKey;
  /** Optional constraints for valid parameter sets. */
  constraints?: {
    /** Minimum number of trades required. */
    minTrades?: number;
    /** Maximum allowed drawdown (negative value, e.g., -0.30 for -30%). */
    maxDrawdown?: number;
    /** Minimum objective score to consider. */
    minScore?: number;
  };
  /** Walk-forward configuration for out-of-sample validation. */
  walkForward?: {
    /** Number of months for in-sample optimization window. */
    inSampleMonths: number;
    /** Number of months for out-of-sample testing window. */
    outSampleMonths: number;
    /** Whether to use anchored or rolling windows. */
    anchored?: boolean;
  };
  /** Number of bootstrap iterations for confidence intervals. */
  bootstrapIterations?: number;
  /** Number of permutation test iterations for p-value calculation. */
  permutationIterations?: number;
  /** Random seed for reproducibility. */
  seed?: number;
}

/** Runtime validator for {@link OptimizationRequest}. */
export const OptimizationRequestSchema = z.object({
  name: z.string().min(1),
  baseRequest: z.object({
    runName: z.string().min(1),
    data: z.array(DataRequestSchema).min(1),
    costs: z.object({
      feeBps: z.number().nonnegative(),
      slippageBps: z.number().nonnegative(),
    }),
    initialCash: z.number().positive(),
    seed: z.number().int().optional(),
    metrics: z
      .array(
        z.enum([
          "sharpe",
          "sortino",
          "max_dd",
          "cagr",
          "winrate",
          "total_pnl",
          "total_return",
          "num_trades",
          "profit_factor",
        ]),
      )
      .optional(),
    riskProfileId: z.string().min(1).optional(),
  }),
  strategy: z.object({
    name: z.string().min(1),
  }),
  paramGrid: z.record(
    z.union([
      z.array(z.number()),
      z.object({
        min: z.number(),
        max: z.number(),
        step: z.number().positive(),
      }),
    ]),
  ),
  objective: z.enum([
    "sharpe",
    "sortino",
    "max_dd",
    "cagr",
    "winrate",
    "total_pnl",
    "total_return",
    "num_trades",
    "profit_factor",
  ]),
  constraints: z
    .object({
      minTrades: z.number().int().nonnegative().optional(),
      maxDrawdown: z.number().max(0).optional(),
      minScore: z.number().optional(),
    })
    .optional(),
  walkForward: z
    .object({
      inSampleMonths: z.number().int().positive(),
      outSampleMonths: z.number().int().positive(),
      anchored: z.boolean().optional(),
    })
    .optional(),
  bootstrapIterations: z.number().int().positive().optional(),
  permutationIterations: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
});

/** -----------------------------------------------------------------------
 *  OptimizationResult
 *  -------------------------------------------------------------------- */

/**
 * Single parameter combination result from optimization.
 */
export interface OptimizationCombinationResult {
  /** Parameter values for this combination. */
  params: Record<string, number>;
  /** In-sample metrics (if walk-forward enabled). */
  inSampleMetrics?: Record<string, number>;
  /** Out-of-sample metrics (if walk-forward enabled). */
  outSampleMetrics?: Record<string, number>;
  /** Full metrics if no walk-forward. */
  metrics?: Record<string, number>;
  /** Objective score (primary ranking metric). */
  score: number;
  /** Robustness score incorporating penalties. */
  robustnessScore?: number;
  /** Bootstrap confidence interval (if enabled). */
  bootstrapCI?: {
    lower: number;
    upper: number;
    width: number;
  };
  /** Permutation test p-value (if enabled). */
  pValue?: number;
  /** Run ID of the backtest for this combination. */
  runId?: string;
  /** Constraint violations, if any. */
  violations?: string[];
}

/**
 * Walk-forward window result.
 */
export interface WalkForwardWindow {
  /** Window index (0-based). */
  windowIndex: number;
  /** In-sample period. */
  inSample: {
    start: ISODate;
    end: ISODate;
  };
  /** Out-of-sample period. */
  outSample: {
    start: ISODate;
    end: ISODate;
  };
  /** Best parameters found in IS optimization. */
  bestParams: Record<string, number>;
  /** In-sample objective score. */
  inSampleScore: number;
  /** Out-of-sample objective score. */
  outSampleScore: number;
  /** Full IS metrics. */
  inSampleMetrics: Record<string, number>;
  /** Full OOS metrics. */
  outSampleMetrics: Record<string, number>;
}

/**
 * Complete optimization result.
 */
export interface OptimizationResult {
  /** Unique optimization job ID. */
  optId: string;
  /** Job name. */
  name: string;
  /** Job status. */
  status: "queued" | "running" | "completed" | "failed";
  /** Strategy being optimized. */
  strategyName: string;
  /** Objective metric. */
  objective: MetricKey;
  /** Total parameter combinations tested. */
  totalCombinations: number;
  /** Best parameter set found. */
  bestParams?: Record<string, number>;
  /** Best objective score. */
  bestScore?: number;
  /** Robustness score of best params. */
  bestRobustnessScore?: number;
  /** All combination results. */
  allResults?: OptimizationCombinationResult[];
  /** Walk-forward analysis results (if enabled). */
  walkForwardResults?: {
    windows: WalkForwardWindow[];
    aggregateOOS: {
      score: number;
      metrics: Record<string, number>;
    };
  };
  /** Timestamps. */
  createdAt: ISODate;
  completedAt?: ISODate;
  /** Error message if failed. */
  error?: string;
}

/** Runtime validator for {@link OptimizationResult}. */
export const OptimizationResultSchema = z.object({
  optId: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["queued", "running", "completed", "failed"]),
  strategyName: z.string().min(1),
  objective: z.enum([
    "sharpe",
    "sortino",
    "max_dd",
    "cagr",
    "winrate",
    "total_pnl",
    "total_return",
    "num_trades",
    "profit_factor",
  ]),
  totalCombinations: z.number().int().nonnegative(),
  bestParams: z.record(z.number()).optional(),
  bestScore: z.number().optional(),
  bestRobustnessScore: z.number().optional(),
  allResults: z
    .array(
      z.object({
        params: z.record(z.number()),
        inSampleMetrics: z.record(z.number()).optional(),
        outSampleMetrics: z.record(z.number()).optional(),
        metrics: z.record(z.number()).optional(),
        score: z.number(),
        robustnessScore: z.number().optional(),
        bootstrapCI: z
          .object({
            lower: z.number(),
            upper: z.number(),
            width: z.number(),
          })
          .optional(),
        pValue: z.number().optional(),
        runId: z.string().optional(),
        violations: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  walkForwardResults: z
    .object({
      windows: z.array(
        z.object({
          windowIndex: z.number().int().nonnegative(),
          inSample: z.object({
            start: z.string(),
            end: z.string(),
          }),
          outSample: z.object({
            start: z.string(),
            end: z.string(),
          }),
          bestParams: z.record(z.number()),
          inSampleScore: z.number(),
          outSampleScore: z.number(),
          inSampleMetrics: z.record(z.number()),
          outSampleMetrics: z.record(z.number()),
        }),
      ),
      aggregateOOS: z.object({
        score: z.number(),
        metrics: z.record(z.number()),
      }),
    })
    .optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});

export const Schemas = {
  DataRequest: DataRequestSchema,
  BacktestRequest: BacktestRequestSchema,
  BacktestResult: BacktestResultSchema,
  RiskProfile: RiskProfileSchema,
  OptimizationRequest: OptimizationRequestSchema,
  OptimizationResult: OptimizationResultSchema,
};

export * from "./strategies/types.js";
export * as strategies from "./strategies/index.js";
export {
  strategyConfigs,
  strategyList,
  type StrategyConfig,
  type StrategyField,
  type StrategyKey,
} from "./strategies/config.js";
