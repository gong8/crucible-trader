import type {
  BacktestRequest,
  DataSource,
  MetricKey,
  StrategyConfig,
  StrategyKey,
  Timeframe,
} from "@crucible-trader/sdk";

export interface DatasetRecord {
  readonly id: number;
  readonly source: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly start?: string | null;
  readonly end?: string | null;
  readonly adjusted: boolean;
  readonly path: string;
  readonly rows: number;
  readonly createdAt: string;
}

export const generateRunName = (strategy: string, symbol: string, timeframe: string): string => {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  return `${slug(strategy)}_${slug(symbol)}_${slug(timeframe)}`;
};

const VALID_TIMEFRAMES: ReadonlyArray<Timeframe> = ["1d", "1h", "15m", "1m"];

const isValidTimeframe = (value: string): value is Timeframe =>
  VALID_TIMEFRAMES.includes(value as Timeframe);

const ensureNonEmpty = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
};

const ensureTimeframe = (value: string, field: string): Timeframe => {
  if (!isValidTimeframe(value)) {
    throw new Error(`${field} must be one of ${VALID_TIMEFRAMES.join(", ")}`);
  }
  return value;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const ensureIsoDate = (value: string, field: string): string => {
  if (!isoDatePattern.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  return value;
};

const ensureDateRange = (start: string, end: string): void => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("date range contains invalid values");
  }
  if (startDate > endDate) {
    throw new Error("start date must be before or equal to end date");
  }
};

const parseNumberField = (
  raw: string,
  field: string,
  { allowZero }: { allowZero: boolean },
): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be numeric`);
  }
  if (allowZero ? parsed < 0 : parsed <= 0) {
    throw new Error(`${field} must be ${allowZero ? "zero or positive" : "positive"}`);
  }
  return parsed;
};

const normalizeSeries = (series: {
  source: DataSource;
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
  adjusted?: boolean;
}): BacktestRequest["data"][number] => {
  const symbol = ensureNonEmpty(series.symbol, "symbol");
  const timeframe = ensureTimeframe(series.timeframe, "timeframe");
  const start = ensureIsoDate(series.start, "start date");
  const end = ensureIsoDate(series.end, "end date");
  ensureDateRange(start, end);
  return {
    source: series.source,
    symbol,
    timeframe,
    start,
    end,
    adjusted: Boolean(series.adjusted),
  };
};

export const buildDatasetOverride = (
  useExisting: boolean,
  dataset: DatasetRecord | null,
): BacktestRequest["data"] | undefined => {
  if (!useExisting || !dataset) {
    return undefined;
  }
  const fallbackDate = new Date().toISOString().slice(0, 10);
  return [
    {
      source: "csv",
      symbol: dataset.symbol,
      timeframe: dataset.timeframe as Timeframe,
      start: dataset.start ?? fallbackDate,
      end: dataset.end ?? dataset.start ?? fallbackDate,
      adjusted: dataset.adjusted,
    },
  ];
};

export interface BuildArgs {
  runName: string;
  dataSource: DataSource;
  symbol: string;
  timeframe: Timeframe;
  start: string;
  end: string;
  adjusted: boolean;
  strategyName: StrategyKey | string; // Allow custom strategy names
  strategyConfig: StrategyConfig | undefined;
  strategyValues: Record<string, number>;
  feeBps: string;
  slippageBps: string;
  initialCash: string;
  seed: string;
  riskProfileId: string;
  selectedMetrics: MetricKey[];
  datasetOverride?: BacktestRequest["data"];
}

export function buildRequestSafely(args: BuildArgs): {
  request: BacktestRequest | null;
  error: string | null;
} {
  try {
    const runName = ensureNonEmpty(args.runName, "run name");
    const symbol = ensureNonEmpty(args.symbol, "symbol");
    const timeframe = ensureTimeframe(args.timeframe, "timeframe");
    const start = ensureIsoDate(args.start, "start date");
    const end = ensureIsoDate(args.end, "end date");
    ensureDateRange(start, end);

    const feeBps = parseNumberField(args.feeBps, "fee bps", { allowZero: true });
    const slippageBps = parseNumberField(args.slippageBps, "slippage bps", { allowZero: true });
    const initialCash = parseNumberField(args.initialCash, "initial cash", { allowZero: false });
    const seed = args.seed ? Number(args.seed) : undefined;
    if (args.seed && !Number.isFinite(seed)) {
      throw new Error("seed must be numeric");
    }

    const normalizedSeries = (
      args.datasetOverride ?? [
        {
          source: args.dataSource,
          symbol,
          timeframe,
          start,
          end,
          adjusted: args.adjusted,
        },
      ]
    ).map(normalizeSeries);

    // For custom strategies, strategyConfig may be undefined
    let params: Record<string, unknown> = {};
    if (args.strategyConfig) {
      const parsedParams = args.strategyConfig.schema.safeParse(args.strategyValues);
      if (!parsedParams.success) {
        const issue = parsedParams.error.issues[0];
        const message = issue?.message ?? "invalid strategy params";
        return { request: null, error: `strategy params error: ${message}` };
      }
      params = parsedParams.data;
    }

    const request: BacktestRequest = {
      runName,
      data: normalizedSeries,
      strategy: {
        name: args.strategyName,
        params,
      },
      costs: {
        feeBps,
        slippageBps,
      },
      initialCash,
      seed,
      metrics: args.selectedMetrics.length > 0 ? args.selectedMetrics : undefined,
      riskProfileId: args.riskProfileId || undefined,
    };

    return { request, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { request: null, error: message };
  }
}
