"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type {
  BacktestRequest,
  DataSource,
  MetricKey,
  StrategyConfig,
  StrategyKey,
  Timeframe,
} from "@crucible-trader/sdk";
import { strategyConfigs, strategyList } from "@crucible-trader/sdk";
import { apiRoute } from "../../lib/api";
import { StrategyControls, mapZodIssues } from "./StrategyControls";

interface DatasetRecord {
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

const metricOptions: MetricKey[] = [
  "sharpe",
  "sortino",
  "max_dd",
  "cagr",
  "winrate",
  "total_pnl",
  "total_return",
  "num_trades",
  "profit_factor",
];
const timeframeOptions: Timeframe[] = ["1d", "1h", "15m", "1m"];
const dataSources: DataSource[] = ["auto", "csv", "tiingo", "polygon"];
const defaultStrategyKey: StrategyKey = strategyList[0]?.key ?? "sma_crossover";

interface SubmissionState {
  status: "idle" | "success" | "error";
  message: string | null;
  runId?: string;
}

export default function NewRunPage(): JSX.Element {
  const [autoNameEnabled, setAutoNameEnabled] = useState(true);
  const [runName, setRunName] = useState("sma_aapl_auto");
  const [useExistingDataset, setUseExistingDataset] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>("auto");
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [start, setStart] = useState("2022-01-01");
  const [end, setEnd] = useState("2024-12-31");
  const [adjusted, setAdjusted] = useState(true);
  const [strategyName, setStrategyName] = useState<StrategyKey>(defaultStrategyKey);
  const [strategyValues, setStrategyValues] = useState<Record<string, number>>({
    ...strategyConfigs[defaultStrategyKey].defaults,
  });
  const [strategyErrors, setStrategyErrors] = useState<Record<string, string>>({});
  const [feeBps, setFeeBps] = useState("1");
  const [slippageBps, setSlippageBps] = useState("2");
  const [initialCash, setInitialCash] = useState("100000");
  const [seed, setSeed] = useState("42");
  const [riskProfileId, setRiskProfileId] = useState("default");
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>([
    "sharpe",
    "max_dd",
    "cagr",
    "total_pnl",
  ]);
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle", message: null });

  const selectedStrategy: StrategyConfig = strategyConfigs[strategyName];

  useEffect(() => {
    setStrategyValues({ ...strategyConfigs[strategyName].defaults });
    setStrategyErrors({});
  }, [strategyName]);

  useEffect(() => {
    if (autoNameEnabled) {
      setRunName(generateRunName(strategyName, symbol, timeframe));
    }
  }, [autoNameEnabled, strategyName, symbol, timeframe]);

  useEffect(() => {
    const parsed = selectedStrategy.schema.safeParse(strategyValues);
    if (parsed.success) {
      setStrategyErrors({});
    } else {
      setStrategyErrors(mapZodIssues(parsed.error.issues));
    }
  }, [selectedStrategy, strategyValues]);

  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );

  useEffect(() => {
    const loadDatasets = async (): Promise<void> => {
      try {
        const response = await fetch(apiRoute("/api/datasets"), {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("failed to load datasets");
        }
        const payload = (await response.json()) as DatasetRecord[];
        setDatasets(Array.isArray(payload) ? payload : []);
      } catch (error) {
        console.error(error);
      }
    };
    void loadDatasets();
  }, []);

  useEffect(() => {
    if (autoNameEnabled) {
      const datasetSymbol = selectedDataset?.symbol ?? symbol;
      const datasetTf = (selectedDataset?.timeframe as Timeframe | undefined) ?? timeframe;
      setRunName(generateRunName(strategyName, datasetSymbol, datasetTf));
    }
  }, [
    autoNameEnabled,
    selectedDataset?.symbol,
    selectedDataset?.timeframe,
    strategyName,
    symbol,
    timeframe,
  ]);

  useEffect(() => {
    if (useExistingDataset && !selectedDatasetId && datasets.length > 0) {
      setSelectedDatasetId(datasets[0]?.id ?? null);
    }
  }, [useExistingDataset, datasets, selectedDatasetId]);

  const requestPreview = useMemo(() => {
    const { request, error } = buildRequestSafely({
      runName,
      dataSource,
      symbol,
      timeframe,
      start,
      end,
      adjusted,
      strategyName,
      strategyConfig: selectedStrategy,
      strategyValues,
      feeBps,
      slippageBps,
      initialCash,
      seed,
      riskProfileId,
      selectedMetrics,
      datasetOverride: buildDatasetOverride(useExistingDataset, selectedDataset),
    });

    if (error) {
      return error;
    }

    return JSON.stringify(request, null, 2);
  }, [
    runName,
    dataSource,
    symbol,
    timeframe,
    start,
    end,
    adjusted,
    strategyName,
    selectedStrategy,
    strategyValues,
    feeBps,
    slippageBps,
    initialCash,
    seed,
    riskProfileId,
    selectedMetrics,
    useExistingDataset,
    selectedDataset,
  ]);

  const handleMetricToggle = (metric: MetricKey): void => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((item) => item !== metric) : [...prev, metric],
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmission({ status: "idle", message: null });

    const { request, error } = buildRequestSafely({
      runName,
      dataSource,
      symbol,
      timeframe,
      start,
      end,
      adjusted,
      strategyName,
      strategyConfig: selectedStrategy,
      strategyValues,
      feeBps,
      slippageBps,
      initialCash,
      seed,
      riskProfileId,
      selectedMetrics,
      datasetOverride: buildDatasetOverride(useExistingDataset, selectedDataset),
    });

    if (!request || error) {
      setSubmission({ status: "error", message: error ?? "invalid request" });
      return;
    }
    if (useExistingDataset && !selectedDataset) {
      setSubmission({ status: "error", message: "select a dataset first" });
      return;
    }

    try {
      const response = await fetch(apiRoute("/api/runs"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!response.ok) {
        let message = `run submission failed (status ${response.status})`;
        try {
          const body = (await response.json()) as { message?: string };
          if (body?.message) {
            message = body.message;
          }
        } catch {
          const text = await response.text();
          if (text.trim().length > 0) {
            message = text;
          }
        }
        throw new Error(message);
      }

      const payload = (await response.json()) as { runId: string };
      setSubmission({ status: "success", message: "run launched", runId: payload.runId });
    } catch (err) {
      console.error("run submission failed", err);
      const message =
        err instanceof Error ? err.message : "failed to launch run. inspect console for details.";
      setSubmission({
        status: "error",
        message,
      });
    }
  };

  return (
    <section className="grid" aria-label="new run">
      <header className="grid" style={{ gap: "0.5rem" }}>
        <h1 className="section-title">new run</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          configure a backtest request and dispatch it to the crucible worker.
        </p>
      </header>

      <form onSubmit={handleSubmit}>
        <fieldset className="grid">
          <legend>run id</legend>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={autoNameEnabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setAutoNameEnabled(event.currentTarget.checked)
              }
            />
            auto-generate name
          </label>
          <label>
            run name
            <input
              value={runName}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setRunName(event.currentTarget.value)
              }
              disabled={autoNameEnabled}
              required
            />
          </label>
        </fieldset>

        <fieldset className="grid">
          <legend>dataset mode</legend>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={useExistingDataset}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setUseExistingDataset(event.currentTarget.checked);
                if (!event.currentTarget.checked) {
                  setSelectedDatasetId(null);
                }
              }}
            />
            use existing dataset
          </label>
          {useExistingDataset ? (
            datasets.length > 0 ? (
              <label>
                select dataset
                <select
                  value={selectedDatasetId ?? ""}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setSelectedDatasetId(
                      event.currentTarget.value ? Number(event.currentTarget.value) : null,
                    )
                  }
                >
                  <option value="">choose dataset</option>
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.symbol} · {dataset.timeframe} · {dataset.source}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="alert">
                no datasets available. register one under the datasets tab.
              </div>
            )
          ) : (
            <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
              provide symbol/timeframe below to fetch data lazily for this run.
            </p>
          )}
        </fieldset>

        <fieldset className="grid">
          <legend>data source</legend>
          <label>
            vendor
            <select
              value={dataSource}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setDataSource(event.currentTarget.value as DataSource)
              }
              disabled={useExistingDataset}
            >
              {dataSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label>
            symbol
            <input
              value={symbol}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSymbol(event.currentTarget.value)
              }
              disabled={useExistingDataset}
              required
            />
          </label>
          <label>
            timeframe
            <select
              value={timeframe}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setTimeframe(event.currentTarget.value as Timeframe)
              }
              disabled={useExistingDataset}
            >
              {timeframeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <label style={{ flex: 1 }}>
              start date
              <input
                type="date"
                value={start}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setStart(event.currentTarget.value)
                }
                disabled={useExistingDataset}
                required={!useExistingDataset}
              />
            </label>
            <label style={{ flex: 1 }}>
              end date
              <input
                type="date"
                value={end}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setEnd(event.currentTarget.value)
                }
                disabled={useExistingDataset}
                required={!useExistingDataset}
              />
            </label>
          </div>
          <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={adjusted}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setAdjusted(event.currentTarget.checked)
              }
              disabled={useExistingDataset}
            />
            use adjusted prices when available
          </label>
        </fieldset>

        <fieldset className="grid">
          <legend>strategy</legend>
          <label>
            strategy preset
            <select
              value={strategyName}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setStrategyName(event.currentTarget.value as StrategyKey)
              }
            >
              {strategyList.map((strategy) => (
                <option key={strategy.key} value={strategy.key}>
                  {strategy.title} - {strategy.description}
                </option>
              ))}
            </select>
          </label>
          <StrategyControls
            config={selectedStrategy}
            values={strategyValues}
            errors={strategyErrors}
            onChange={(field, value) => {
              setStrategyValues((prev) => ({ ...prev, [field]: value }));
            }}
          />
        </fieldset>

        <fieldset className="grid">
          <legend>costs & capital</legend>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <label style={{ flex: 1 }}>
              fee bps
              <input
                type="number"
                value={feeBps}
                min={0}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setFeeBps(event.currentTarget.value)
                }
                required
              />
            </label>
            <label style={{ flex: 1 }}>
              slippage bps
              <input
                type="number"
                value={slippageBps}
                min={0}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSlippageBps(event.currentTarget.value)
                }
                required
              />
            </label>
          </div>
          <label>
            initial cash
            <input
              type="number"
              value={initialCash}
              min="0"
              step="1000"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setInitialCash(event.currentTarget.value)
              }
              required
            />
          </label>
          <label>
            deterministic seed
            <input
              type="number"
              value={seed}
              min="0"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSeed(event.currentTarget.value)
              }
            />
          </label>
        </fieldset>

        <fieldset className="grid">
          <legend>metrics & risk</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {metricOptions.map((metric) => (
              <label
                key={metric}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.8rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(metric)}
                  onChange={() => handleMetricToggle(metric)}
                />
                {metric}
              </label>
            ))}
          </div>
          <label>
            risk profile id
            <input
              value={riskProfileId}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setRiskProfileId(event.currentTarget.value)
              }
              placeholder="default"
            />
          </label>
        </fieldset>

        <button
          type="submit"
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            border: "1px solid #f97316",
            background: "#f97316",
            color: "#0b0d12",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          launch run
        </button>

        {submission.status === "success" ? (
          <div className="alert" style={{ borderColor: "#22c55e", color: "#22c55e" }}>
            run queued: <strong>{submission.runId}</strong>
          </div>
        ) : null}
        {submission.status === "error" && submission.message ? (
          <div className="alert">{submission.message}</div>
        ) : null}
      </form>

      <section className="grid" aria-label="request preview">
        <h2 className="section-title">request preview</h2>
        <pre>{requestPreview}</pre>
      </section>
    </section>
  );
}

const generateRunName = (strategy: string, symbol: string, timeframe: string): string => {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  return `${slug(strategy)}_${slug(symbol)}_${slug(timeframe)}`;
};

const buildDatasetOverride = (
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

interface BuildArgs {
  runName: string;
  dataSource: DataSource;
  symbol: string;
  timeframe: Timeframe;
  start: string;
  end: string;
  adjusted: boolean;
  strategyName: string;
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

function buildRequestSafely(args: BuildArgs): {
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
