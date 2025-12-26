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
  strategyName: StrategyKey;
  strategyConfig: StrategyConfig;
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
    const parsedParams = args.strategyConfig.schema.safeParse(args.strategyValues);
    if (!parsedParams.success) {
      const issue = parsedParams.error.issues[0];
      const message = issue?.message ?? "invalid strategy params";
      return { request: null, error: `strategy params error: ${message}` };
    }

    const request: BacktestRequest = {
      runName: args.runName,
      data: [
        {
          source: args.dataSource,
          symbol: args.symbol,
          timeframe: args.timeframe,
          start: args.start,
          end: args.end,
          adjusted: args.adjusted,
        },
      ],
      strategy: {
        name: args.strategyName,
        params: parsedParams.data,
      },
      costs: {
        feeBps: Number(args.feeBps),
        slippageBps: Number(args.slippageBps),
      },
      initialCash: Number(args.initialCash),
      seed: args.seed ? Number(args.seed) : undefined,
      metrics: args.selectedMetrics.length > 0 ? args.selectedMetrics : undefined,
      riskProfileId: args.riskProfileId || undefined,
    };

    return { request, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid strategy params";
    return { request: null, error: `strategy params error: ${message}` };
  }
}
