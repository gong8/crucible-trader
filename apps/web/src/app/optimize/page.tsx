"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  strategyConfigs,
  type StrategyKey,
  type DataSource,
  type Timeframe,
} from "@crucible-trader/sdk";
import { apiRoute } from "../../lib/api";

interface DatasetRecord {
  id: number;
  symbol: string;
  timeframe: string;
  source: string;
  startDate: string;
  endDate: string;
  rowCount: number;
  createdAt: string;
}

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
      step?: number;
      description?: string;
    }
  >;
}

interface ParamRange {
  min: number;
  max: number;
  step: number;
}

interface ParamGridValue {
  type: "discrete" | "range";
  discrete?: number[];
  range?: ParamRange;
}

interface OptimizationJob {
  optId: string;
  name: string;
  strategyName: string;
  objective: string;
  status: string;
  totalCombinations: number;
  completedCombinations?: number;
  estimatedTimeRemainingMs?: number;
  bestScore?: number;
  bestParams?: Record<string, number>;
  createdAt: string;
  completedAt?: string;
}

interface CombinationResult {
  params: Record<string, number>;
  score: number;
  robustnessScore?: number;
  metrics?: Record<string, number>;
  violations?: string[];
}

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

const initialRange = createInitialRange();

function formatTimeRemaining(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function ProgressBar({
  completed,
  total,
  estimatedTimeRemainingMs,
}: {
  completed: number;
  total: number;
  estimatedTimeRemainingMs?: number;
}) {
  const percentage = (completed / total) * 100;

  return (
    <div
      style={{
        padding: "1.5rem",
        background: "rgba(255, 107, 53, 0.05)",
        border: "1px solid rgba(255, 107, 53, 0.3)",
        borderRadius: "8px",
        marginBottom: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.75rem",
          fontSize: "0.9rem",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span style={{ color: "var(--ember-orange)", fontWeight: "600" }}>
          {completed.toLocaleString()} / {total.toLocaleString()} combinations
        </span>
        {estimatedTimeRemainingMs != null && estimatedTimeRemainingMs > 0 && (
          <span style={{ color: "var(--spark-yellow)" }}>
            ETA: {formatTimeRemaining(estimatedTimeRemainingMs)}
          </span>
        )}
      </div>
      <div
        style={{
          height: "12px",
          background: "var(--graphite-300)",
          borderRadius: "6px",
          overflow: "hidden",
          border: "1px solid var(--graphite-100)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percentage}%`,
            background: "linear-gradient(90deg, var(--ember-orange) 0%, #ff8c5a 100%)",
            transition: "width 0.5s ease-out",
            boxShadow: "0 0 12px rgba(255, 107, 53, 0.5)",
          }}
        />
      </div>
      <div
        style={{
          marginTop: "0.5rem",
          fontSize: "0.75rem",
          color: "var(--steel-300)",
          textAlign: "center",
        }}
      >
        {percentage.toFixed(1)}% complete
      </div>
    </div>
  );
}

export default function OptimizePage(): JSX.Element {
  const router = useRouter();
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
  const [strategyName, setStrategyName] = useState<StrategyKey>("sma_crossover");
  const [paramGrid, setParamGrid] = useState<Record<string, ParamGridValue>>({});
  const [objective, setObjective] = useState("sharpe");
  const [minTrades, setMinTrades] = useState<number | "">(5);
  const [maxDrawdown, setMaxDrawdown] = useState<number | "">(-0.2);
  const [enableWalkForward, setEnableWalkForward] = useState(false);
  const [inSampleMonths, setInSampleMonths] = useState<number | "">(12);
  const [outSampleMonths, setOutSampleMonths] = useState<number | "">(3);
  const [useExistingDataset, setUseExistingDataset] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("auto");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [symbol, setSymbol] = useState("AAPL");
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [adjusted, setAdjusted] = useState(true);
  const [initialCash, setInitialCash] = useState<number | "">(100000);
  const [jobName, setJobName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [jobDetails, setJobDetails] = useState<
    | (OptimizationJob & {
        allResults?: CombinationResult[];
        walkForwardResults?: {
          windows: unknown[];
          aggregateOOS: { score: number; metrics: Record<string, number> };
        };
      })
    | null
  >(null);

  const strategy = strategyConfigs[strategyName];
  const selectedCustomStrategy = customStrategies.find((s) => s.id === strategyName);

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
        if (!response.ok) throw new Error("failed to load datasets");
        const payload = (await response.json()) as DatasetRecord[];
        setDatasets(Array.isArray(payload) ? payload : []);
      } catch (error) {
        console.error("Failed to load datasets:", error);
      }
    };
    void loadDatasets();
  }, []);

  useEffect(() => {
    if (useExistingDataset && !selectedDatasetId && datasets.length > 0) {
      setSelectedDatasetId(datasets[0]?.id ?? null);
    }
  }, [useExistingDataset, datasets, selectedDatasetId]);

  useEffect(() => {
    const loadCustomStrategies = async (): Promise<void> => {
      try {
        const response = await fetch("/api/strategies", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as CustomStrategy[];
        setCustomStrategies(Array.isArray(payload) ? payload : []);
      } catch (error) {
        console.error("Error loading custom strategies:", error);
      }
    };
    void loadCustomStrategies();
  }, []);

  useEffect(() => {
    const initialGrid: Record<string, ParamGridValue> = {};

    if (strategy) {
      strategy.fields.forEach((field) => {
        const defaultValue = strategy.defaults[field.key] as number;
        initialGrid[field.key] = { type: "discrete", discrete: [defaultValue] };
      });
    } else if (selectedCustomStrategy?.configSchema) {
      Object.entries(selectedCustomStrategy.configSchema).forEach(([key, field]) => {
        if (field.type === "number") {
          initialGrid[key] = {
            type: "discrete",
            discrete: [typeof field.default === "number" ? field.default : 0],
          };
        }
      });
    }

    setParamGrid(initialGrid);
  }, [strategyName, strategy, selectedCustomStrategy]);

  useEffect(() => {
    const fetchJobs = async (): Promise<void> => {
      try {
        const response = await fetch(apiRoute("/api/optimize"));
        if (response.ok) {
          const data = await response.json();
          setJobs(data.optimizations || []);
        }
      } catch (error) {
        console.error("Failed to fetch optimizations:", error);
      }
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedJob) {
      setJobDetails(null);
      return;
    }
    const fetchDetails = async (): Promise<void> => {
      try {
        const response = await fetch(apiRoute(`/api/optimize/${selectedJob}`));
        if (response.ok) {
          const data = await response.json();
          setJobDetails(data);
        }
      } catch (error) {
        console.error("Failed to fetch job details:", error);
      }
    };
    fetchDetails();
    const interval = setInterval(fetchDetails, 3000);
    return () => clearInterval(interval);
  }, [selectedJob]);

  const addDiscreteValue = (paramKey: string): void => {
    const current = paramGrid[paramKey];
    if (current?.type === "discrete") {
      setParamGrid({
        ...paramGrid,
        [paramKey]: {
          ...current,
          discrete: [...(current.discrete || []), 0],
        },
      });
    }
  };

  const updateDiscreteValue = (paramKey: string, index: number, value: number | ""): void => {
    const current = paramGrid[paramKey];
    if (current?.type === "discrete" && current.discrete) {
      const updated = [...current.discrete];
      updated[index] = value === "" ? 0 : value;
      setParamGrid({
        ...paramGrid,
        [paramKey]: {
          ...current,
          discrete: updated,
        },
      });
    }
  };

  const removeDiscreteValue = (paramKey: string, index: number): void => {
    const current = paramGrid[paramKey];
    if (current?.type === "discrete" && current.discrete) {
      setParamGrid({
        ...paramGrid,
        [paramKey]: {
          ...current,
          discrete: current.discrete.filter((_, i) => i !== index),
        },
      });
    }
  };

  const switchToRange = (paramKey: string): void => {
    const field = strategy?.fields.find((f) => f.key === paramKey);
    const customField = selectedCustomStrategy?.configSchema?.[paramKey];

    setParamGrid({
      ...paramGrid,
      [paramKey]: {
        type: "range",
        range: {
          min: field?.min ?? customField?.min ?? 1,
          max: field?.max ?? customField?.max ?? 100,
          step: field?.step ?? customField?.step ?? 1,
        },
      },
    });
  };

  const switchToDiscrete = (paramKey: string): void => {
    const defaultValue =
      (strategy?.defaults[paramKey] as number) ??
      (typeof selectedCustomStrategy?.configSchema?.[paramKey]?.default === "number"
        ? selectedCustomStrategy.configSchema[paramKey].default
        : 0);
    setParamGrid({
      ...paramGrid,
      [paramKey]: {
        type: "discrete",
        discrete: [defaultValue],
      },
    });
  };

  const updateRange = (paramKey: string, field: keyof ParamRange, value: number | ""): void => {
    const current = paramGrid[paramKey];
    if (current?.type === "range" && current.range) {
      setParamGrid({
        ...paramGrid,
        [paramKey]: {
          ...current,
          range: {
            ...current.range,
            [field]: value === "" ? 0 : value,
          },
        },
      });
    }
  };

  const calculateTotalCombinations = (): number => {
    let total = 1;
    Object.values(paramGrid).forEach((value) => {
      if (value.type === "discrete" && value.discrete) {
        total *= value.discrete.length;
      } else if (value.type === "range" && value.range) {
        const { min, max, step } = value.range;
        const count = Math.floor((max - min) / step) + 1;
        total *= count;
      }
    });
    return total;
  };

  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true);
    setNotification(null);

    try {
      if (useExistingDataset) {
        if (!selectedDataset) {
          setNotification({ type: "error", message: "Please select a dataset" });
          setSubmitting(false);
          return;
        }
      } else {
        if (!symbol || symbol.trim() === "") {
          setNotification({ type: "error", message: "Symbol is required" });
          setSubmitting(false);
          return;
        }

        if (!startDate || !endDate) {
          setNotification({ type: "error", message: "Start and end dates are required" });
          setSubmitting(false);
          return;
        }
      }

      const apiParamGrid: Record<string, number[] | ParamRange> = {};
      let hasValidParams = false;

      Object.entries(paramGrid).forEach(([key, value]) => {
        if (value.type === "discrete" && value.discrete && value.discrete.length > 0) {
          apiParamGrid[key] = value.discrete;
          hasValidParams = true;
        } else if (value.type === "range" && value.range) {
          const { min, max, step } = value.range;
          if (max > min && step > 0) {
            apiParamGrid[key] = value.range;
            hasValidParams = true;
          }
        }
      });

      if (!hasValidParams) {
        setNotification({
          type: "error",
          message: "At least one valid parameter must be configured for optimization",
        });
        setSubmitting(false);
        return;
      }

      const actualStrategyName = selectedCustomStrategy
        ? selectedCustomStrategy.name
        : strategyName;

      const request = {
        name: jobName || `Optimize ${actualStrategyName} - ${new Date().toLocaleString()}`,
        baseRequest: {
          runName: `opt-${actualStrategyName}`,
          data:
            useExistingDataset && selectedDataset
              ? [
                  {
                    datasetId: selectedDataset.id,
                    symbol: selectedDataset.symbol,
                    timeframe: selectedDataset.timeframe as Timeframe,
                    start: selectedDataset.startDate,
                    end: selectedDataset.endDate,
                  },
                ]
              : [
                  {
                    source: dataSource,
                    symbol,
                    timeframe,
                    start: startDate,
                    end: endDate,
                    adjusted,
                  },
                ],
          costs: {
            feeBps: 1,
            slippageBps: 2,
          },
          initialCash: initialCash === "" ? 100000 : initialCash,
          seed: 42,
        },
        strategy: {
          name: actualStrategyName,
        },
        paramGrid: apiParamGrid,
        objective,
        constraints: {
          minTrades: minTrades === "" ? 5 : minTrades,
          maxDrawdown: maxDrawdown === "" ? -0.2 : maxDrawdown,
        },
        ...(enableWalkForward && {
          walkForward: {
            inSampleMonths: inSampleMonths === "" ? 12 : inSampleMonths,
            outSampleMonths: outSampleMonths === "" ? 3 : outSampleMonths,
            anchored: false,
          },
        }),
      };

      const response = await fetch(apiRoute("/api/optimize/grid"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (response.ok) {
        const data = await response.json();
        setNotification({
          type: "success",
          message: `Optimization job created: ${data.optId}`,
        });
        setSelectedJob(data.optId);
      } else {
        const errorData = await response.json();
        const errorMsg = errorData.error || errorData.message || "Failed to create optimization";
        setNotification({
          type: "error",
          message: errorMsg,
        });
      }
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--graphite-500)",
        padding: "2rem",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div style={{ maxWidth: "1600px", margin: "0 auto" }}>
        {/* Header */}
        <header style={{ marginBottom: "3rem" }}>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: "700",
              background: "linear-gradient(135deg, var(--ember-orange) 0%, #ff8c5a 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "0.75rem",
              letterSpacing: "-0.02em",
            }}
          >
            OPTIMIZATION FORGE
          </h1>
          <p
            style={{
              color: "var(--steel-300)",
              fontSize: "0.95rem",
              maxWidth: "800px",
            }}
          >
            Grid search parameter optimization with walk-forward validation and robustness scoring
          </p>
        </header>

        {/* Main Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(400px, 600px) 1fr",
            gap: "2rem",
            alignItems: "start",
          }}
        >
          {/* Configuration Panel */}
          <div style={{ position: "sticky", top: "2rem", minWidth: 0, overflow: "hidden" }}>
            <FormSection title="Strategy & Data Configuration">
              <FormField label="Job Name">
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="Auto-generated if empty"
                />
              </FormField>

              <FormField label="Strategy">
                <select
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value as StrategyKey)}
                >
                  {Object.values(strategyConfigs).map((config) => (
                    <option key={config.key} value={config.key}>
                      {config.title}
                    </option>
                  ))}
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
              </FormField>

              <Divider />

              <Checkbox
                checked={useExistingDataset}
                onChange={(checked) => {
                  setUseExistingDataset(checked);
                  if (!checked) setSelectedDatasetId(null);
                }}
                label="Use existing dataset"
              />

              {useExistingDataset ? (
                datasets.length > 0 ? (
                  <FormField label="Dataset">
                    <select
                      value={selectedDatasetId ?? ""}
                      onChange={(e) =>
                        setSelectedDatasetId(e.target.value ? Number(e.target.value) : null)
                      }
                    >
                      <option value="">Choose dataset</option>
                      {datasets.map((dataset) => (
                        <option key={dataset.id} value={dataset.id}>
                          {dataset.symbol} · {dataset.timeframe} · {dataset.source}
                        </option>
                      ))}
                    </select>
                  </FormField>
                ) : (
                  <Alert type="warning">
                    No datasets available. Register one under the datasets tab.
                  </Alert>
                )
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <FormField label="Data Vendor">
                      <select
                        value={dataSource}
                        onChange={(e) => setDataSource(e.target.value as DataSource)}
                      >
                        <option value="auto">AUTO</option>
                        <option value="csv">CSV</option>
                        <option value="tiingo">TIINGO</option>
                        <option value="polygon">POLYGON</option>
                      </select>
                    </FormField>
                    <FormField label="Timeframe">
                      <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                      >
                        <option value="1d">1D</option>
                        <option value="1h">1H</option>
                        <option value="15m">15M</option>
                        <option value="1m">1M</option>
                      </select>
                    </FormField>
                  </div>

                  <FormField label="Symbol">
                    <input
                      type="text"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      placeholder="e.g. AAPL"
                      style={{ textTransform: "uppercase" }}
                    />
                  </FormField>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <FormField label="Start Date">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </FormField>
                    <FormField label="End Date">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </FormField>
                  </div>

                  <Checkbox checked={adjusted} onChange={setAdjusted} label="Use adjusted prices" />

                  {/* Data Period Summary */}
                  {startDate && endDate && (
                    <div
                      style={{
                        marginTop: "1rem",
                        padding: "0.75rem",
                        background: "rgba(168, 178, 196, 0.05)",
                        border: "1px solid var(--graphite-300)",
                        borderRadius: "4px",
                        fontSize: "0.85rem",
                        color: "var(--steel-300)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <div style={{ marginBottom: "0.25rem" }}>
                        <strong style={{ color: "var(--steel-100)" }}>Timeframe:</strong>{" "}
                        {timeframe.toUpperCase()}
                      </div>
                      <div>
                        <strong style={{ color: "var(--steel-100)" }}>Duration:</strong>{" "}
                        {(() => {
                          const start = new Date(startDate);
                          const end = new Date(endDate);
                          const days = Math.ceil(
                            (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
                          );
                          const years = Math.floor(days / 365);
                          const months = Math.floor((days % 365) / 30);
                          const remainingDays = days % 30;

                          const parts = [];
                          if (years > 0) parts.push(`${years}y`);
                          if (months > 0) parts.push(`${months}m`);
                          if (remainingDays > 0 || parts.length === 0)
                            parts.push(`${remainingDays}d`);

                          return `${parts.join(" ")} (${days.toLocaleString()} days)`;
                        })()}
                      </div>
                      <div style={{ marginTop: "0.25rem" }}>
                        <strong style={{ color: "var(--steel-100)" }}>Min Trades:</strong>{" "}
                        {minTrades === "" ? 5 : minTrades}
                      </div>
                    </div>
                  )}
                </>
              )}

              <FormField label="Initial Cash">
                <input
                  type="number"
                  value={initialCash}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInitialCash(val === "" ? "" : Number(val));
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "") setInitialCash(100000);
                  }}
                  step="1000"
                />
              </FormField>
            </FormSection>

            <FormSection title="Parameter Grid">
              {strategy ? (
                strategy.fields.map((field) => {
                  const gridValue = paramGrid[field.key];
                  if (!gridValue) return null;

                  return (
                    <ParameterControl
                      key={field.key}
                      label={field.label}
                      paramKey={field.key}
                      gridValue={gridValue}
                      fieldConfig={field}
                      onSwitchToDiscrete={switchToDiscrete}
                      onSwitchToRange={switchToRange}
                      onAddDiscreteValue={addDiscreteValue}
                      onUpdateDiscreteValue={updateDiscreteValue}
                      onRemoveDiscreteValue={removeDiscreteValue}
                      onUpdateRange={updateRange}
                    />
                  );
                })
              ) : selectedCustomStrategy?.configSchema ? (
                Object.entries(selectedCustomStrategy.configSchema).map(([key, field]) => {
                  if (field.type !== "number") return null;
                  const gridValue = paramGrid[key];
                  if (!gridValue) return null;

                  return (
                    <ParameterControl
                      key={key}
                      label={field.label}
                      paramKey={key}
                      gridValue={gridValue}
                      fieldConfig={{
                        key,
                        label: field.label,
                        min: field.min,
                        max: field.max,
                        step: field.step,
                      }}
                      onSwitchToDiscrete={switchToDiscrete}
                      onSwitchToRange={switchToRange}
                      onAddDiscreteValue={addDiscreteValue}
                      onUpdateDiscreteValue={updateDiscreteValue}
                      onRemoveDiscreteValue={removeDiscreteValue}
                      onUpdateRange={updateRange}
                    />
                  );
                })
              ) : (
                <Alert type="warning">
                  No parameters available for optimization. Select a strategy with configurable
                  parameters.
                </Alert>
              )}

              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  background: "rgba(255, 107, 53, 0.1)",
                  border: "2px solid var(--ember-orange)",
                  borderRadius: "6px",
                  textAlign: "center",
                  minWidth: 0,
                  wordBreak: "break-word",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--steel-300)",
                    marginBottom: "0.25rem",
                  }}
                >
                  TOTAL COMBINATIONS
                </div>
                <div
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: "700",
                    color: "var(--ember-orange)",
                  }}
                >
                  {calculateTotalCombinations().toLocaleString()}
                </div>
              </div>
            </FormSection>

            <FormSection title="Objective & Constraints">
              <FormField label="Objective Metric">
                <select value={objective} onChange={(e) => setObjective(e.target.value)}>
                  <option value="sharpe">Sharpe Ratio</option>
                  <option value="sortino">Sortino Ratio</option>
                  <option value="cagr">CAGR</option>
                  <option value="total_return">Total Return</option>
                  <option value="profit_factor">Profit Factor</option>
                </select>
              </FormField>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <FormField label="Min Trades">
                  <input
                    type="number"
                    value={minTrades}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMinTrades(val === "" ? "" : Number(val));
                    }}
                    onBlur={(e) => {
                      if (e.target.value === "") setMinTrades(10);
                    }}
                  />
                </FormField>

                <FormField label="Max Drawdown">
                  <input
                    type="number"
                    value={maxDrawdown}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMaxDrawdown(val === "" ? "" : Number(val));
                    }}
                    onBlur={(e) => {
                      if (e.target.value === "") setMaxDrawdown(-0.3);
                    }}
                    step="0.01"
                    max="0"
                    placeholder="-0.3"
                  />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Walk-Forward Validation">
              <Checkbox
                checked={enableWalkForward}
                onChange={setEnableWalkForward}
                label="Enable Walk-Forward Analysis"
              />

              {enableWalkForward && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    marginTop: "1rem",
                  }}
                >
                  <FormField label="In-Sample (months)">
                    <input
                      type="number"
                      value={inSampleMonths}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInSampleMonths(val === "" ? "" : Number(val));
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") setInSampleMonths(12);
                      }}
                      min="1"
                    />
                  </FormField>
                  <FormField label="Out-of-Sample (months)">
                    <input
                      type="number"
                      value={outSampleMonths}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOutSampleMonths(val === "" ? "" : Number(val));
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") setOutSampleMonths(3);
                      }}
                      min="1"
                    />
                  </FormField>
                </div>
              )}
            </FormSection>

            <button
              onClick={handleSubmit}
              disabled={submitting || calculateTotalCombinations() === 0}
              style={{
                width: "100%",
                padding: "1.25rem",
                fontSize: "0.95rem",
                fontWeight: "700",
                background: submitting
                  ? "var(--graphite-300)"
                  : "linear-gradient(135deg, var(--ember-orange) 0%, #ff8c5a 100%)",
                color: submitting ? "var(--steel-400)" : "white",
                border: "none",
                borderRadius: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: submitting
                  ? "none"
                  : "0 4px 20px rgba(255, 107, 53, 0.4), 0 0 40px rgba(255, 107, 53, 0.2)",
                transition: "all 0.3s ease",
              }}
            >
              {submitting ? "Submitting..." : "Launch Optimization"}
            </button>

            {notification && (
              <Alert type={notification.type} onClose={() => setNotification(null)}>
                {notification.message}
              </Alert>
            )}
          </div>

          {/* Results Panel */}
          <div>
            <FormSection title="Optimization Jobs">
              {jobs.length === 0 ? (
                <div
                  style={{
                    padding: "3rem 2rem",
                    textAlign: "center",
                    color: "var(--steel-400)",
                    fontSize: "0.9rem",
                  }}
                >
                  No optimization jobs yet. Configure and launch one to get started.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {jobs.map((job) => (
                    <JobCard
                      key={job.optId}
                      job={job}
                      isSelected={selectedJob === job.optId}
                      onClick={() => setSelectedJob(job.optId)}
                    />
                  ))}
                </div>
              )}
            </FormSection>

            {jobDetails && (
              <>
                {jobDetails.status === "running" &&
                  jobDetails.completedCombinations != null &&
                  jobDetails.totalCombinations > 0 && (
                    <ProgressBar
                      completed={jobDetails.completedCombinations}
                      total={jobDetails.totalCombinations}
                      estimatedTimeRemainingMs={jobDetails.estimatedTimeRemainingMs}
                    />
                  )}

                {jobDetails.status === "completed" && jobDetails.bestParams && (
                  <BestParametersCard
                    bestParams={jobDetails.bestParams}
                    bestScore={jobDetails.bestScore}
                    objective={jobDetails.objective}
                    strategyName={jobDetails.strategyName}
                    symbol={symbol}
                    timeframe={timeframe}
                    startDate={startDate}
                    endDate={endDate}
                    dataSource={dataSource}
                    adjusted={adjusted}
                    router={router}
                  />
                )}

                {jobDetails.allResults && jobDetails.allResults.length > 0 && (
                  <ResultsTable results={jobDetails.allResults} />
                )}

                {jobDetails.walkForwardResults && (
                  <WalkForwardResults
                    results={jobDetails.walkForwardResults}
                    objective={jobDetails.objective}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// Component Library
// ============================================================================

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--graphite-400)",
        border: "1px solid var(--graphite-200)",
        borderRadius: "8px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <h2
        style={{
          fontSize: "0.85rem",
          fontWeight: "700",
          color: "var(--ember-orange)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "1.5rem",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid var(--graphite-200)",
        }}
      >
        {title}
      </h2>
      <div style={{ display: "grid", gap: "1.25rem" }}>{children}</div>
    </section>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "0.5rem" }}>
      <span
        style={{
          fontSize: "0.8rem",
          color: "var(--steel-200)",
          fontWeight: "500",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        cursor: "pointer",
        padding: "0.5rem 0",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: "18px",
          height: "18px",
          accentColor: "var(--ember-orange)",
          cursor: "pointer",
        }}
      />
      <span style={{ fontSize: "0.9rem", color: "var(--steel-100)" }}>{label}</span>
    </label>
  );
}

function Divider() {
  return (
    <hr
      style={{ border: "none", borderTop: "1px solid var(--graphite-200)", margin: "0.5rem 0" }}
    />
  );
}

function Alert({
  type,
  children,
  onClose,
}: {
  type: "success" | "error" | "warning";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const colors = {
    success: {
      border: "var(--success-green)",
      bg: "rgba(16, 185, 129, 0.1)",
      text: "var(--success-green)",
    },
    error: { border: "var(--danger-red)", bg: "rgba(239, 68, 68, 0.1)", text: "var(--danger-red)" },
    warning: {
      border: "var(--spark-yellow)",
      bg: "rgba(255, 210, 63, 0.1)",
      text: "var(--spark-yellow)",
    },
  };

  return (
    <div
      style={{
        padding: "1rem 1.25rem",
        marginTop: "1rem",
        borderRadius: "6px",
        border: `1px solid ${colors[type].border}`,
        background: colors[type].bg,
        color: colors[type].text,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "0.85rem",
      }}
    >
      <span>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            fontSize: "1.2rem",
            cursor: "pointer",
            padding: "0 0.5rem",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function ParameterControl({
  label,
  paramKey,
  gridValue,
  fieldConfig,
  onSwitchToDiscrete,
  onSwitchToRange,
  onAddDiscreteValue,
  onUpdateDiscreteValue,
  onRemoveDiscreteValue,
  onUpdateRange,
}: {
  label: string;
  paramKey: string;
  gridValue: ParamGridValue;
  fieldConfig: { key: string; label: string; min?: number; max?: number; step?: number };
  onSwitchToDiscrete: (key: string) => void;
  onSwitchToRange: (key: string) => void;
  onAddDiscreteValue: (key: string) => void;
  onUpdateDiscreteValue: (key: string, index: number, value: number | "") => void;
  onRemoveDiscreteValue: (key: string, index: number) => void;
  onUpdateRange: (key: string, field: keyof ParamRange, value: number | "") => void;
}) {
  return (
    <div
      style={{
        background: "var(--graphite-500)",
        border: "1px solid var(--graphite-200)",
        borderRadius: "6px",
        padding: "1rem",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ fontSize: "0.85rem", color: "var(--steel-100)", fontWeight: "600" }}>
          {label}
        </h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => onSwitchToDiscrete(paramKey)}
            style={{
              padding: "0.4rem 0.75rem",
              fontSize: "0.7rem",
              background: gridValue.type === "discrete" ? "var(--ember-orange)" : "transparent",
              color: gridValue.type === "discrete" ? "white" : "var(--steel-300)",
              border: `1px solid ${gridValue.type === "discrete" ? "var(--ember-orange)" : "var(--graphite-200)"}`,
              borderRadius: "4px",
              cursor: "pointer",
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            Discrete
          </button>
          <button
            onClick={() => onSwitchToRange(paramKey)}
            style={{
              padding: "0.4rem 0.75rem",
              fontSize: "0.7rem",
              background: gridValue.type === "range" ? "var(--ember-orange)" : "transparent",
              color: gridValue.type === "range" ? "white" : "var(--steel-300)",
              border: `1px solid ${gridValue.type === "range" ? "var(--ember-orange)" : "var(--graphite-200)"}`,
              borderRadius: "4px",
              cursor: "pointer",
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            Range
          </button>
        </div>
      </div>

      {gridValue.type === "discrete" && gridValue.discrete && (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {gridValue.discrete.map((value, idx) => (
            <div key={idx} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="number"
                value={value}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateDiscreteValue(paramKey, idx, val === "" ? "" : Number(val));
                }}
                step={fieldConfig.step}
                style={{ flex: 1 }}
              />
              {gridValue.discrete && gridValue.discrete.length > 1 && (
                <button
                  onClick={() => onRemoveDiscreteValue(paramKey, idx)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "var(--danger-red)",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => onAddDiscreteValue(paramKey)}
            style={{
              padding: "0.6rem",
              background: "var(--success-green)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: "600",
            }}
          >
            + Add Value
          </button>
        </div>
      )}

      {gridValue.type === "range" && gridValue.range && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "0.5rem",
          }}
        >
          <FormField label="Min">
            <input
              type="number"
              value={gridValue.range.min}
              onChange={(e) => {
                const val = e.target.value;
                onUpdateRange(paramKey, "min", val === "" ? "" : Number(val));
              }}
              step={fieldConfig.step}
              style={{ width: "100%", minWidth: 0 }}
            />
          </FormField>
          <FormField label="Max">
            <input
              type="number"
              value={gridValue.range.max}
              onChange={(e) => {
                const val = e.target.value;
                onUpdateRange(paramKey, "max", val === "" ? "" : Number(val));
              }}
              step={fieldConfig.step}
              style={{ width: "100%", minWidth: 0 }}
            />
          </FormField>
          <FormField label="Step">
            <input
              type="number"
              value={gridValue.range.step}
              onChange={(e) => {
                const val = e.target.value;
                onUpdateRange(paramKey, "step", val === "" ? "" : Number(val));
              }}
              step={fieldConfig.step}
              style={{ width: "100%", minWidth: 0 }}
            />
          </FormField>
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  isSelected,
  onClick,
}: {
  job: OptimizationJob;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusColors = {
    completed: "var(--success-green)",
    failed: "var(--danger-red)",
    running: "var(--spark-yellow)",
    queued: "var(--steel-400)",
  };

  return (
    <button
      onClick={onClick}
      style={{
        padding: "1.25rem",
        background: isSelected ? "var(--graphite-300)" : "var(--graphite-500)",
        border: `2px solid ${isSelected ? "var(--ember-orange)" : "var(--graphite-200)"}`,
        borderRadius: "8px",
        textAlign: "left",
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: isSelected ? "0 0 20px rgba(255, 107, 53, 0.3)" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
          marginBottom: "0.75rem",
        }}
      >
        <h3
          style={{
            fontSize: "0.9rem",
            fontWeight: "600",
            color: "var(--steel-100)",
            flex: 1,
            marginRight: "1rem",
          }}
        >
          {job.name}
        </h3>
        <span
          style={{
            fontSize: "0.7rem",
            padding: "0.35rem 0.75rem",
            background: statusColors[job.status as keyof typeof statusColors] || "var(--steel-400)",
            color: job.status === "running" ? "var(--graphite-500)" : "white",
            borderRadius: "12px",
            textTransform: "uppercase",
            fontWeight: "700",
            letterSpacing: "0.03em",
          }}
        >
          {job.status}
        </span>
      </div>

      <div style={{ fontSize: "0.75rem", color: "var(--steel-300)", lineHeight: "1.6" }}>
        <div>
          Strategy: <span style={{ color: "var(--steel-100)" }}>{job.strategyName}</span>
        </div>
        <div>
          Combinations:{" "}
          <span style={{ color: "var(--steel-100)" }}>
            {job.totalCombinations.toLocaleString()}
          </span>
          {" · "}
          Objective: <span style={{ color: "var(--steel-100)" }}>{job.objective}</span>
        </div>
        {job.bestScore != null && (
          <div>
            Best Score:{" "}
            <span style={{ color: "var(--success-green)", fontWeight: "600" }}>
              {job.bestScore.toFixed(4)}
            </span>
          </div>
        )}
        {job.status === "running" && job.completedCombinations != null && (
          <div style={{ marginTop: "0.5rem", color: "var(--ember-orange)" }}>
            Progress: {job.completedCombinations} / {job.totalCombinations} (
            {((job.completedCombinations / job.totalCombinations) * 100).toFixed(1)}%)
          </div>
        )}
      </div>
    </button>
  );
}

function BestParametersCard({
  bestParams,
  bestScore,
  objective,
  strategyName,
  symbol,
  timeframe,
  startDate,
  endDate,
  dataSource,
  adjusted,
  router,
}: {
  bestParams: Record<string, number>;
  bestScore?: number;
  objective: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  dataSource: string;
  adjusted: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div
      style={{
        marginBottom: "2rem",
        padding: "1.5rem",
        background: "var(--graphite-400)",
        border: "2px solid var(--success-green)",
        borderRadius: "8px",
        boxShadow: "0 0 30px rgba(16, 185, 129, 0.2)",
      }}
    >
      <h3
        style={{
          fontSize: "0.85rem",
          fontWeight: "700",
          color: "var(--success-green)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "1rem",
        }}
      >
        Best Parameters
      </h3>

      <div style={{ display: "grid", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "1rem" }}>
        {Object.entries(bestParams).map(([key, value]) => (
          <div
            key={key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0.5rem 0.75rem",
              background: "var(--graphite-500)",
              borderRadius: "4px",
            }}
          >
            <span style={{ color: "var(--steel-300)" }}>{key}</span>
            <span
              style={{
                color: "var(--steel-100)",
                fontWeight: "700",
                fontFamily: "var(--font-mono)",
              }}
            >
              {value}
            </span>
          </div>
        ))}

        {bestScore != null && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "0.75rem",
              paddingTop: "0.75rem",
              borderTop: "2px solid var(--graphite-200)",
              padding: "0.75rem",
              background: "rgba(16, 185, 129, 0.1)",
              borderRadius: "4px",
            }}
          >
            <span style={{ color: "var(--success-green)", fontWeight: "700" }}>
              {objective.toUpperCase()}
            </span>
            <span
              style={{
                color: "var(--success-green)",
                fontWeight: "700",
                fontSize: "1.1rem",
                fontFamily: "var(--font-mono)",
              }}
            >
              {bestScore.toFixed(4)}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        <button
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(bestParams, null, 2));
            alert("Best parameters copied to clipboard!");
          }}
          style={{
            width: "100%",
            padding: "0.75rem",
            background: "transparent",
            color: "var(--success-green)",
            border: "2px solid var(--success-green)",
            borderRadius: "6px",
            fontSize: "0.75rem",
            fontWeight: "700",
            textTransform: "uppercase",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          Copy Parameters
        </button>
        <button
          onClick={() => {
            const params = new URLSearchParams({
              strategy: strategyName,
              symbol,
              timeframe,
              start: startDate,
              end: endDate,
              dataSource,
              adjusted: adjusted.toString(),
              ...Object.fromEntries(
                Object.entries(bestParams).map(([key, value]) => [`param_${key}`, String(value)]),
              ),
            });
            router.push(`/new-run?${params.toString()}`);
          }}
          style={{
            width: "100%",
            padding: "0.75rem",
            background:
              "linear-gradient(135deg, var(--success-green) 0%, var(--success-green-dark) 100%)",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "0.75rem",
            fontWeight: "700",
            textTransform: "uppercase",
            cursor: "pointer",
            letterSpacing: "0.05em",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
          }}
        >
          Run Backtest
        </button>
      </div>
    </div>
  );
}

function ResultsTable({ results }: { results: CombinationResult[] }) {
  const withViolations = results.filter((r) => r.violations && r.violations.length > 0);
  const validResults = results.filter((r) => !r.violations || r.violations.length === 0);

  return (
    <div style={{ marginBottom: "2rem" }}>
      {withViolations.length > 0 && (
        <Alert type="warning">
          <div>
            <strong>Constraint Violations:</strong> {validResults.length} valid / {results.length}{" "}
            total combinations
          </div>
        </Alert>
      )}

      <h3
        style={{
          fontSize: "0.85rem",
          fontWeight: "700",
          color: "var(--steel-200)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "1rem",
          marginTop: "1.5rem",
        }}
      >
        All Results ({results.length})
      </h3>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            fontSize: "0.75rem",
            borderCollapse: "collapse",
            background: "var(--graphite-400)",
            border: "1px solid var(--graphite-200)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <thead>
            <tr style={{ background: "var(--graphite-300)" }}>
              <th
                style={{
                  padding: "0.75rem",
                  textAlign: "left",
                  borderBottom: "2px solid var(--ember-orange)",
                  color: "var(--ember-orange)",
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                Rank
              </th>
              {results[0]?.params &&
                Object.keys(results[0].params).map((key) => (
                  <th
                    key={key}
                    style={{
                      padding: "0.75rem",
                      textAlign: "left",
                      borderBottom: "2px solid var(--ember-orange)",
                      color: "var(--ember-orange)",
                      fontWeight: "700",
                      textTransform: "uppercase",
                    }}
                  >
                    {key}
                  </th>
                ))}
              <th
                style={{
                  padding: "0.75rem",
                  textAlign: "left",
                  borderBottom: "2px solid var(--ember-orange)",
                  color: "var(--ember-orange)",
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                Score
              </th>
              <th
                style={{
                  padding: "0.75rem",
                  textAlign: "left",
                  borderBottom: "2px solid var(--ember-orange)",
                  color: "var(--ember-orange)",
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                Robustness
              </th>
              <th
                style={{
                  padding: "0.75rem",
                  textAlign: "left",
                  borderBottom: "2px solid var(--ember-orange)",
                  color: "var(--ember-orange)",
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {results
              .sort((a, b) => (b.robustnessScore ?? b.score) - (a.robustnessScore ?? a.score))
              .slice(0, 50)
              .map((result, idx) => (
                <tr
                  key={idx}
                  style={{
                    background:
                      result.violations && result.violations.length > 0
                        ? "rgba(239, 68, 68, 0.05)"
                        : idx === 0
                          ? "rgba(16, 185, 129, 0.1)"
                          : idx % 2 === 0
                            ? "var(--graphite-500)"
                            : "transparent",
                    borderBottom: "1px solid var(--graphite-200)",
                  }}
                >
                  <td style={{ padding: "0.75rem", color: "var(--steel-300)" }}>{idx + 1}</td>
                  {Object.values(result.params).map((value, i) => (
                    <td
                      key={i}
                      style={{
                        padding: "0.75rem",
                        color: "var(--steel-100)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {value}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "0.75rem",
                      color: idx === 0 ? "var(--success-green)" : "var(--steel-100)",
                      fontWeight: idx === 0 ? "700" : "400",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {result.score.toFixed(4)}
                  </td>
                  <td
                    style={{
                      padding: "0.75rem",
                      color: "var(--steel-100)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {result.robustnessScore?.toFixed(4) ?? "-"}
                  </td>
                  <td
                    style={{
                      padding: "0.75rem",
                      color:
                        result.violations && result.violations.length > 0
                          ? "var(--danger-red)"
                          : "var(--success-green)",
                      fontSize: "0.75rem",
                    }}
                    title={result.violations?.join(", ") || "Valid"}
                  >
                    {result.violations && result.violations.length > 0
                      ? `${result.violations.length} violation${result.violations.length > 1 ? "s" : ""}`
                      : "Valid"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WalkForwardResults({
  results,
  objective,
}: {
  results: {
    windows: unknown[];
    aggregateOOS: { score: number; metrics: Record<string, number> };
  };
  objective: string;
}) {
  return (
    <div style={{ marginTop: "2rem" }}>
      <h3
        style={{
          fontSize: "0.85rem",
          fontWeight: "700",
          color: "var(--steel-200)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "1rem",
        }}
      >
        Walk-Forward Results
      </h3>
      <div
        style={{
          padding: "1.5rem",
          background: "var(--graphite-400)",
          border: "1px solid var(--graphite-200)",
          borderRadius: "8px",
        }}
      >
        <div style={{ fontSize: "0.9rem" }}>
          <strong style={{ color: "var(--ember-orange)" }}>
            Aggregate Out-of-Sample {objective.toUpperCase()}:
          </strong>{" "}
          <span
            style={{
              color: "var(--success-green)",
              fontWeight: "700",
              fontSize: "1.1rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            {results.aggregateOOS.score.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}
