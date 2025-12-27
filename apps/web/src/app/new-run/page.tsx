"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useSearchParams } from "next/navigation";

// Force dynamic rendering to support useSearchParams
export const dynamic = "force-dynamic";

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

interface CustomStrategy {
  id: string;
  name: string;
  description: string;
  configSchema?: Record<
    string,
    {
      type: "number" | "string" | "boolean";
      label: string;
      default: number | string | boolean;
      min?: number;
      max?: number;
      description?: string;
    }
  >;
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

function NewRunPageContent(): JSX.Element {
  const searchParams = useSearchParams();
  const initialRange = useMemo(() => createInitialRange(), []);
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
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
  const dateInputsDisabled = useExistingDataset; // Only disable when using existing dataset

  const selectedStrategy: StrategyConfig | undefined = strategyConfigs[strategyName];
  const selectedCustomStrategy = customStrategies.find((s) => s.id === strategyName);

  useEffect(() => {
    if (selectedStrategy) {
      setStrategyValues({ ...selectedStrategy.defaults });
    } else if (selectedCustomStrategy?.configSchema) {
      // Initialize with defaults from custom strategy config
      const defaults: Record<string, number> = {};
      Object.entries(selectedCustomStrategy.configSchema).forEach(([key, field]) => {
        defaults[key] = Number(field.default);
      });
      setStrategyValues(defaults);
    } else {
      setStrategyValues({});
    }
    setStrategyErrors({});
  }, [strategyName, selectedStrategy, selectedCustomStrategy]);

  useEffect(() => {
    if (autoNameEnabled) {
      setRunName(generateRunName(strategyName, symbol, timeframe));
    }
  }, [autoNameEnabled, strategyName, symbol, timeframe]);

  useEffect(() => {
    if (!selectedStrategy) {
      setStrategyErrors({});
      return;
    }
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

  // Load custom strategies from API
  useEffect(() => {
    const loadCustomStrategies = async (): Promise<void> => {
      try {
        const response = await fetch("/api/strategies", {
          cache: "no-store",
        });
        if (!response.ok) {
          console.warn("Failed to load custom strategies");
          return;
        }
        const payload = (await response.json()) as CustomStrategy[];
        console.log("[new-run] Loaded custom strategies:", payload);
        setCustomStrategies(Array.isArray(payload) ? payload : []);
      } catch (error) {
        console.error("Error loading custom strategies:", error);
      }
    };
    void loadCustomStrategies();
  }, []);

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

  // Auto-select strategy from query parameter
  useEffect(() => {
    const strategyParam = searchParams?.get("strategy");
    if (strategyParam) {
      console.log("[new-run] Auto-selecting strategy from query param:", strategyParam);
      setStrategyName(strategyParam as StrategyKey);
    }
  }, [searchParams]);

  const requestPreview = useMemo(() => {
    // For custom strategies, use the actual name instead of the ID
    const actualStrategyName = selectedCustomStrategy ? selectedCustomStrategy.name : strategyName;

    const { request, error } = buildRequestSafely({
      runName,
      dataSource,
      symbol,
      timeframe,
      start,
      end,
      adjusted,
      strategyName: actualStrategyName,
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
    selectedCustomStrategy,
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

    // For custom strategies, use the actual name instead of the ID
    const actualStrategyName = selectedCustomStrategy ? selectedCustomStrategy.name : strategyName;

    const { request, error } = buildRequestSafely({
      runName,
      dataSource,
      symbol,
      timeframe,
      start,
      end,
      adjusted,
      strategyName: actualStrategyName,
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
      // Show available range but don't lock - user can still edit
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
    <div style={{ display: "grid", gap: "2rem" }}>
      {/* HEADER */}
      <header>
        <h1 className="section-title">configure backtest</h1>
        <p style={{ color: "var(--steel-200)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
          set parameters and ignite your trading strategy through the crucible
        </p>
      </header>

      {/* MAIN LAYOUT: Side-by-side configuration and preview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: "2rem",
          alignItems: "start",
        }}
      >
        {/* LEFT: Configuration Form */}
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1.5rem" }}>
          {/* Run Identity */}
          <div className="card">
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "var(--ember-orange)",
                marginBottom: "1.25rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Run Identity
            </h3>
            <div style={{ display: "grid", gap: "1rem" }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
                <input
                  type="checkbox"
                  checked={autoNameEnabled}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setAutoNameEnabled(event.currentTarget.checked)
                  }
                />
                <span style={{ textTransform: "none" }}>Auto-generate run name</span>
              </label>
              <label>
                Run Name
                <input
                  value={runName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRunName(event.currentTarget.value)
                  }
                  disabled={autoNameEnabled}
                  required
                  style={{ fontWeight: "600" }}
                />
              </label>
            </div>
          </div>

          {/* Data Configuration */}
          <div className="card">
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "var(--ember-orange)",
                marginBottom: "1.25rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Data Configuration
            </h3>
            <div style={{ display: "grid", gap: "1rem" }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
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
                <span style={{ textTransform: "none" }}>Use existing dataset</span>
              </label>

              {useExistingDataset ? (
                datasets.length > 0 ? (
                  <label>
                    Dataset
                    <select
                      value={selectedDatasetId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setSelectedDatasetId(
                          event.currentTarget.value ? Number(event.currentTarget.value) : null,
                        )
                      }
                    >
                      <option value="">Choose dataset</option>
                      {datasets.map((dataset) => (
                        <option key={dataset.id} value={dataset.id}>
                          {dataset.symbol} · {dataset.timeframe} · {dataset.source}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="alert">
                    No datasets available. Register one under the datasets tab.
                  </div>
                )
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <label>
                      Data Vendor
                      <select
                        value={dataSource}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          setDataSource(event.currentTarget.value as DataSource)
                        }
                      >
                        {dataSources.map((source) => (
                          <option key={source} value={source}>
                            {source.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Timeframe
                      <select
                        value={timeframe}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          setTimeframe(event.currentTarget.value as Timeframe)
                        }
                      >
                        {timeframeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Symbol
                    <input
                      value={symbol}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setSymbol(event.currentTarget.value.toUpperCase())
                      }
                      required
                      placeholder="e.g. AAPL"
                      style={{ textTransform: "uppercase" }}
                    />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <label>
                      Start Date
                      <input
                        type="date"
                        value={start}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setStart(event.currentTarget.value)
                        }
                        disabled={dateInputsDisabled}
                        required
                      />
                    </label>
                    <label>
                      End Date
                      <input
                        type="date"
                        value={end}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setEnd(event.currentTarget.value)
                        }
                        disabled={dateInputsDisabled}
                        required
                      />
                    </label>
                  </div>
                  {datesLocked && coverage ? (
                    <div
                      style={{
                        padding: "0.75rem",
                        background: "var(--graphite-400)",
                        borderLeft: "3px solid var(--spark-yellow)",
                        fontSize: "0.75rem",
                        color: "var(--steel-200)",
                      }}
                    >
                      Available Range: {coverage.start} → {coverage.end} (
                      {coverage.source === "auto"
                        ? `auto via ${coverage.contributingSources.join(", ")}`
                        : coverage.source}
                      )
                    </div>
                  ) : null}
                  <label style={{ flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
                    <input
                      type="checkbox"
                      checked={adjusted}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setAdjusted(event.currentTarget.checked)
                      }
                    />
                    <span style={{ textTransform: "none" }}>Use adjusted prices</span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Strategy Configuration */}
          <div className="card">
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "var(--ember-orange)",
                marginBottom: "1.25rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Strategy
            </h3>
            <div style={{ display: "grid", gap: "1rem" }}>
              <label>
                Strategy Preset
                <select
                  value={strategyName}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setStrategyName(event.currentTarget.value as StrategyKey)
                  }
                  style={{ fontWeight: "600" }}
                >
                  {/* Built-in strategies */}
                  {strategyList.map((strategy) => (
                    <option key={strategy.key} value={strategy.key}>
                      {strategy.title} — {strategy.description}
                    </option>
                  ))}
                  {/* Custom strategies */}
                  {customStrategies.length > 0 && (
                    <optgroup label="CUSTOM STRATEGIES">
                      {customStrategies.map((strategy) => (
                        <option key={strategy.id} value={strategy.id}>
                          {strategy.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              {selectedStrategy ? (
                <StrategyControls
                  config={selectedStrategy}
                  values={strategyValues}
                  errors={strategyErrors}
                  onChange={(field, value) => {
                    setStrategyValues((prev) => ({ ...prev, [field]: value }));
                  }}
                />
              ) : selectedCustomStrategy?.configSchema ? (
                <div style={{ display: "grid", gap: "1rem" }}>
                  {Object.entries(selectedCustomStrategy.configSchema).map(([key, field]) => (
                    <label key={key}>
                      {field.label}
                      {field.type === "number" && (
                        <input
                          type="number"
                          value={strategyValues[key] ?? field.default}
                          min={field.min}
                          max={field.max}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStrategyValues((prev) => ({
                              ...prev,
                              [key]: val === "" ? "" : Number(val),
                            }));
                          }}
                          onBlur={(e) => {
                            if (e.target.value === "") {
                              setStrategyValues((prev) => ({
                                ...prev,
                                [key]: Number(field.default),
                              }));
                            }
                          }}
                        />
                      )}
                      {field.description && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.7rem",
                            color: "var(--steel-400)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {field.description}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: "1rem",
                    background: "var(--graphite-400)",
                    borderLeft: "3px solid var(--spark-yellow)",
                    fontSize: "0.75rem",
                    color: "var(--steel-200)",
                  }}
                >
                  Custom strategy selected. No configuration available.
                </div>
              )}
            </div>
          </div>

          {/* Execution Parameters */}
          <div className="card">
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "var(--ember-orange)",
                marginBottom: "1.25rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Execution Parameters
            </h3>
            <div style={{ display: "grid", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <label>
                  Fee (bps)
                  <input
                    type="number"
                    value={feeBps}
                    min={0}
                    step="0.1"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setFeeBps(event.currentTarget.value)
                    }
                    required
                  />
                </label>
                <label>
                  Slippage (bps)
                  <input
                    type="number"
                    value={slippageBps}
                    min={0}
                    step="0.1"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSlippageBps(event.currentTarget.value)
                    }
                    required
                  />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <label>
                  Initial Cash ($)
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
                  Random Seed
                  <input
                    type="number"
                    value={seed}
                    min="0"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSeed(event.currentTarget.value)
                    }
                  />
                </label>
              </div>
              <label>
                Risk Profile ID
                <input
                  value={riskProfileId}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRiskProfileId(event.currentTarget.value)
                  }
                  placeholder="default"
                />
              </label>
            </div>
          </div>

          {/* Metrics Selection */}
          <div className="card">
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "var(--ember-orange)",
                marginBottom: "1.25rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Metrics to Compute
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {metricOptions.map((metric) => (
                <label
                  key={metric}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    padding: "0.5rem",
                    background: selectedMetrics.includes(metric)
                      ? "rgba(255, 107, 53, 0.1)"
                      : "transparent",
                    border: `1px solid ${selectedMetrics.includes(metric) ? "var(--ember-orange)" : "var(--graphite-100)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric)}
                    onChange={() => handleMetricToggle(metric)}
                  />
                  {metric.replace(/_/g, " ")}
                </label>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button type="submit" className="btn-primary" style={{ width: "100%" }}>
            Run Backtest
          </button>

          {/* Submission Status */}
          {submission.status === "success" ? (
            <div
              className="alert"
              style={{
                borderLeft: "4px solid var(--success-green)",
                background: "linear-gradient(90deg, rgba(16, 185, 129, 0.1) 0%, transparent 100%)",
                color: "var(--success-green)",
              }}
            >
              Run queued: <strong>{submission.runId}</strong>
            </div>
          ) : null}
          {submission.status === "error" && submission.message ? (
            <div
              className="alert"
              style={{
                borderLeft: "4px solid var(--danger-red)",
                background: "linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%)",
                color: "var(--danger-red)",
              }}
            >
              Error: {submission.message}
            </div>
          ) : null}
        </form>

        {/* RIGHT: Request Preview (Sticky) */}
        <div
          style={{
            position: "sticky",
            top: "2rem",
          }}
        >
          <div className="card">
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "var(--ember-orange)",
                marginBottom: "1.25rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              🔍 Request Payload
            </h3>
            <pre
              style={{
                fontSize: "0.7rem",
                lineHeight: "1.4",
                maxHeight: "600px",
                overflow: "auto",
              }}
            >
              {requestPreview}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewRunPage(): JSX.Element {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewRunPageContent />
    </Suspense>
  );
}
