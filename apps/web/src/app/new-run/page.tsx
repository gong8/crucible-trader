"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type {
  DataSource,
  MetricKey,
  StrategyConfig,
  StrategyKey,
  Timeframe,
} from "@crucible-trader/sdk";
import { strategyConfigs, strategyList } from "@crucible-trader/sdk";
import { apiRoute } from "../../lib/api";
import { StrategyControls, mapZodIssues } from "./StrategyControls";
import type { DatasetRecord } from "./helpers";
import { buildDatasetOverride, buildRequestSafely, generateRunName } from "./helpers";
import { computeAvailableRange, type CoverageRange } from "./date-range";

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

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const createInitialRange = (): { start: string; end: string } => {
  const end = new Date();
  // Use yesterday as the end date to avoid requesting today's data which might not be available yet
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  // Use 1 year instead of 2 to be more conservative with API limits
  start.setFullYear(start.getFullYear() - 1);
  return {
    start: isoDate(start),
    end: isoDate(end),
  };
};

interface SubmissionState {
  status: "idle" | "success" | "error";
  message: string | null;
  runId?: string;
}

export default function NewRunPage(): JSX.Element {
  const initialRange = useMemo(() => createInitialRange(), []);
  const [autoNameEnabled, setAutoNameEnabled] = useState(true);
  const [runName, setRunName] = useState("sma_aapl_auto");
  const [useExistingDataset, setUseExistingDataset] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>("auto");
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [start, setStart] = useState(initialRange.start);
  const [end, setEnd] = useState(initialRange.end);
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
  const [datesLocked, setDatesLocked] = useState(false);
  const dateInputsDisabled = useExistingDataset || datesLocked;

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
  const [coverage, setCoverage] = useState<CoverageRange | null>(null);
  const previousCoverage = useRef<string | null>(null);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );

  useEffect(() => {
    setCoverage(
      computeAvailableRange({
        datasets,
        symbol,
        timeframe,
        source: dataSource,
      }),
    );
  }, [datasets, symbol, timeframe, dataSource]);

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

  useEffect(() => {
    if (useExistingDataset) {
      setDatesLocked(false);
      previousCoverage.current = null;
      return;
    }
    if (coverage) {
      setDatesLocked(true);
      previousCoverage.current = `${coverage.start}:${coverage.end}`;
      setStart((prev) => (prev === coverage.start ? prev : coverage.start));
      setEnd((prev) => (prev === coverage.end ? prev : coverage.end));
      return;
    }
    if (previousCoverage.current) {
      previousCoverage.current = null;
      setStart(initialRange.start);
      setEnd(initialRange.end);
    }
    setDatesLocked(false);
  }, [coverage, useExistingDataset, initialRange.start, initialRange.end]);

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
                disabled={dateInputsDisabled}
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
                disabled={dateInputsDisabled}
                required={!useExistingDataset}
              />
            </label>
          </div>
          {!useExistingDataset && datesLocked && coverage ? (
            <p style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
              date range locked to {coverage.start} → {coverage.end} (
              {coverage.source === "auto"
                ? `auto via ${coverage.contributingSources.join(", ")}`
                : coverage.source}
              )
            </p>
          ) : null}
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
