"use client";

import { useState, useEffect, useMemo } from "react";
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

export default function OptimizePage(): JSX.Element {
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
  const [strategyName, setStrategyName] = useState<StrategyKey>("sma_crossover");
  const [paramGrid, setParamGrid] = useState<Record<string, ParamGridValue>>({});
  const [objective, setObjective] = useState("sharpe");
  const [minTrades, setMinTrades] = useState<number | "">(10);
  const [maxDrawdown, setMaxDrawdown] = useState<number | "">(-0.3);
  const [enableWalkForward, setEnableWalkForward] = useState(false);
  const [inSampleMonths, setInSampleMonths] = useState<number | "">(12);
  const [outSampleMonths, setOutSampleMonths] = useState<number | "">(3);
  // Data configuration
  const [useExistingDataset, setUseExistingDataset] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("auto");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [symbol, setSymbol] = useState("AAPL");
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
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

  // Load datasets
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
        console.error("Failed to load datasets:", error);
      }
    };
    void loadDatasets();
  }, []);

  // Auto-select first dataset when enabling "use existing dataset"
  useEffect(() => {
    if (useExistingDataset && !selectedDatasetId && datasets.length > 0) {
      setSelectedDatasetId(datasets[0]?.id ?? null);
    }
  }, [useExistingDataset, datasets, selectedDatasetId]);

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
        console.log("[optimize] Loaded custom strategies:", payload);
        setCustomStrategies(Array.isArray(payload) ? payload : []);
      } catch (error) {
        console.error("Error loading custom strategies:", error);
      }
    };
    void loadCustomStrategies();
  }, []);

  // Initialize param grid when strategy changes
  useEffect(() => {
    const initialGrid: Record<string, ParamGridValue> = {};

    if (strategy) {
      // Built-in strategy
      strategy.fields.forEach((field) => {
        const defaultValue = strategy.defaults[field.key] as number;
        initialGrid[field.key] = {
          type: "discrete",
          discrete: [defaultValue],
        };
      });
    } else if (selectedCustomStrategy?.configSchema) {
      // Custom strategy
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

  // Fetch optimization jobs
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

  // Fetch job details when selected
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
      // Validate inputs
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

      // Convert param grid to API format and validate
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

      // For custom strategies, use the actual name instead of the ID
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
          minTrades: minTrades === "" ? 10 : minTrades,
          maxDrawdown: maxDrawdown === "" ? -0.3 : maxDrawdown,
        },
        ...(enableWalkForward && {
          walkForward: {
            inSampleMonths: inSampleMonths === "" ? 12 : inSampleMonths,
            outSampleMonths: outSampleMonths === "" ? 3 : outSampleMonths,
            anchored: false,
          },
        }),
      };

      console.log("[optimize] Request payload:", JSON.stringify(request, null, 2));

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
        console.error("[optimize] Error response:", errorData);
        const errorMsg = errorData.error || errorData.message || "Failed to create optimization";
        setNotification({
          type: "error",
          message: errorMsg,
        });
      }
    } catch (error) {
      console.error("[optimize] Submission error:", error);
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem" }}>
      <div style={{ marginBottom: "3rem" }}>
        <h1
          style={{
            fontSize: "2rem",
            marginBottom: "0.5rem",
            color: "var(--ember-orange)",
          }}
        >
          strategy optimization
        </h1>
        <p style={{ color: "var(--steel-300)", fontSize: "0.85rem" }}>
          Grid search parameter optimization with walk-forward validation and robustness scoring
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
        {/* Configuration Panel */}
        <div>
          <section style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: "0.9rem",
                marginBottom: "1rem",
                color: "var(--steel-200)",
                borderBottom: "1px solid var(--graphite-100)",
                paddingBottom: "0.5rem",
              }}
            >
              1. strategy & data
            </h2>

            <div style={{ display: "grid", gap: "1rem" }}>
              <label>
                <span>Job Name</span>
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="Auto-generated if empty"
                />
              </label>

              <label>
                <span>Strategy</span>
                <select
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value as StrategyKey)}
                >
                  {/* Built-in strategies */}
                  {Object.values(strategyConfigs).map((config) => (
                    <option key={config.key} value={config.key}>
                      {config.title}
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

              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--graphite-100)",
                  margin: "0.5rem 0",
                }}
              />

              <label
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.75rem",
                  textTransform: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={useExistingDataset}
                  onChange={(e) => {
                    setUseExistingDataset(e.target.checked);
                    if (!e.target.checked) {
                      setSelectedDatasetId(null);
                    }
                  }}
                />
                <span>Use existing dataset</span>
              </label>

              {useExistingDataset ? (
                datasets.length > 0 ? (
                  <label>
                    <span>Dataset</span>
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
                  </label>
                ) : (
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "rgba(255, 210, 63, 0.1)",
                      borderLeft: "3px solid var(--spark-yellow)",
                      color: "var(--spark-yellow)",
                      fontSize: "0.85rem",
                    }}
                  >
                    No datasets available. Register one under the datasets tab.
                  </div>
                )
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <label>
                      <span>Data Vendor</span>
                      <select
                        value={dataSource}
                        onChange={(e) => setDataSource(e.target.value as DataSource)}
                      >
                        <option value="auto">AUTO</option>
                        <option value="csv">CSV</option>
                        <option value="tiingo">TIINGO</option>
                        <option value="polygon">POLYGON</option>
                      </select>
                    </label>
                    <label>
                      <span>Timeframe</span>
                      <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                      >
                        <option value="1d">1D</option>
                        <option value="1h">1H</option>
                        <option value="15m">15M</option>
                        <option value="1m">1M</option>
                      </select>
                    </label>
                  </div>

                  <label>
                    <span>Symbol</span>
                    <input
                      type="text"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      placeholder="e.g. AAPL"
                      style={{ textTransform: "uppercase" }}
                    />
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <label>
                      <span>Start Date</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </label>
                    <label>
                      <span>End Date</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </label>
                  </div>

                  <label
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: "0.75rem",
                      textTransform: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={adjusted}
                      onChange={(e) => setAdjusted(e.target.checked)}
                    />
                    <span>Use adjusted prices</span>
                  </label>
                </>
              )}

              <label>
                <span>Initial Cash</span>
                <input
                  type="number"
                  value={initialCash}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInitialCash(val === "" ? "" : Number(val));
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "") {
                      setInitialCash(100000);
                    }
                  }}
                  step="1000"
                />
              </label>
            </div>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: "0.9rem",
                marginBottom: "1rem",
                color: "var(--steel-200)",
                borderBottom: "1px solid var(--graphite-100)",
                paddingBottom: "0.5rem",
              }}
            >
              2. parameter grid
            </h2>

            {strategy ? (
              // Built-in strategy fields
              strategy.fields.map((field) => {
                const gridValue = paramGrid[field.key];
                if (!gridValue) return null;

                return (
                  <div
                    key={field.key}
                    style={{
                      background: "var(--graphite-400)",
                      border: "1px solid var(--graphite-100)",
                      padding: "1rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <h3 style={{ fontSize: "0.85rem", color: "var(--ember-orange)" }}>
                        {field.label}
                      </h3>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => switchToDiscrete(field.key)}
                          style={{
                            padding: "0.25rem 0.75rem",
                            fontSize: "0.7rem",
                            background:
                              gridValue.type === "discrete" ? "var(--ember-orange)" : "transparent",
                            color: gridValue.type === "discrete" ? "white" : "var(--steel-300)",
                            border: "1px solid var(--graphite-100)",
                          }}
                        >
                          discrete
                        </button>
                        <button
                          onClick={() => switchToRange(field.key)}
                          style={{
                            padding: "0.25rem 0.75rem",
                            fontSize: "0.7rem",
                            background:
                              gridValue.type === "range" ? "var(--ember-orange)" : "transparent",
                            color: gridValue.type === "range" ? "white" : "var(--steel-300)",
                            border: "1px solid var(--graphite-100)",
                          }}
                        >
                          range
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
                                updateDiscreteValue(field.key, idx, val === "" ? "" : Number(val));
                              }}
                              step={field.step}
                              style={{ flex: 1 }}
                            />
                            {gridValue.discrete && gridValue.discrete.length > 1 && (
                              <button
                                onClick={() => removeDiscreteValue(field.key, idx)}
                                style={{
                                  padding: "0.5rem",
                                  background: "var(--danger-red)",
                                  color: "white",
                                  fontSize: "0.75rem",
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addDiscreteValue(field.key)}
                          style={{
                            padding: "0.5rem",
                            background: "var(--success-green)",
                            color: "white",
                            fontSize: "0.75rem",
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
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "0.5rem",
                        }}
                      >
                        <label>
                          <span style={{ fontSize: "0.7rem" }}>Min</span>
                          <input
                            type="number"
                            value={gridValue.range.min}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateRange(field.key, "min", val === "" ? "" : Number(val));
                            }}
                            step={field.step}
                          />
                        </label>
                        <label>
                          <span style={{ fontSize: "0.7rem" }}>Max</span>
                          <input
                            type="number"
                            value={gridValue.range.max}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateRange(field.key, "max", val === "" ? "" : Number(val));
                            }}
                            step={field.step}
                          />
                        </label>
                        <label>
                          <span style={{ fontSize: "0.7rem" }}>Step</span>
                          <input
                            type="number"
                            value={gridValue.range.step}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateRange(field.key, "step", val === "" ? "" : Number(val));
                            }}
                            step={field.step}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })
            ) : selectedCustomStrategy?.configSchema ? (
              // Custom strategy fields
              Object.entries(selectedCustomStrategy.configSchema).map(([key, field]) => {
                if (field.type !== "number") return null;
                const gridValue = paramGrid[key];
                if (!gridValue) return null;

                return (
                  <div
                    key={key}
                    style={{
                      background: "var(--graphite-400)",
                      border: "1px solid var(--graphite-100)",
                      padding: "1rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <h3 style={{ fontSize: "0.85rem", color: "var(--ember-orange)" }}>
                        {field.label}
                      </h3>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => switchToDiscrete(key)}
                          style={{
                            padding: "0.25rem 0.75rem",
                            fontSize: "0.7rem",
                            background:
                              gridValue.type === "discrete" ? "var(--ember-orange)" : "transparent",
                            color: gridValue.type === "discrete" ? "white" : "var(--steel-300)",
                            border: "1px solid var(--graphite-100)",
                          }}
                        >
                          discrete
                        </button>
                        <button
                          onClick={() => switchToRange(key)}
                          style={{
                            padding: "0.25rem 0.75rem",
                            fontSize: "0.7rem",
                            background:
                              gridValue.type === "range" ? "var(--ember-orange)" : "transparent",
                            color: gridValue.type === "range" ? "white" : "var(--steel-300)",
                            border: "1px solid var(--graphite-100)",
                          }}
                        >
                          range
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
                                updateDiscreteValue(key, idx, val === "" ? "" : Number(val));
                              }}
                              step={field.step ?? 1}
                              style={{ flex: 1 }}
                            />
                            {gridValue.discrete && gridValue.discrete.length > 1 && (
                              <button
                                onClick={() => removeDiscreteValue(key, idx)}
                                style={{
                                  padding: "0.5rem",
                                  background: "var(--danger-red)",
                                  color: "white",
                                  fontSize: "0.75rem",
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addDiscreteValue(key)}
                          style={{
                            padding: "0.5rem",
                            background: "var(--success-green)",
                            color: "white",
                            fontSize: "0.75rem",
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
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "0.5rem",
                        }}
                      >
                        <label>
                          <span style={{ fontSize: "0.7rem" }}>Min</span>
                          <input
                            type="number"
                            value={gridValue.range.min}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateRange(key, "min", val === "" ? "" : Number(val));
                            }}
                            step={field.step ?? 1}
                          />
                        </label>
                        <label>
                          <span style={{ fontSize: "0.7rem" }}>Max</span>
                          <input
                            type="number"
                            value={gridValue.range.max}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateRange(key, "max", val === "" ? "" : Number(val));
                            }}
                            step={field.step ?? 1}
                          />
                        </label>
                        <label>
                          <span style={{ fontSize: "0.7rem" }}>Step</span>
                          <input
                            type="number"
                            value={gridValue.range.step}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateRange(key, "step", val === "" ? "" : Number(val));
                            }}
                            step={field.step ?? 1}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  padding: "1rem",
                  background: "var(--graphite-400)",
                  border: "1px solid var(--spark-yellow)",
                  fontSize: "0.85rem",
                  color: "var(--steel-300)",
                }}
              >
                No parameters available for optimization. Select a strategy with configurable
                parameters.
              </div>
            )}

            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "var(--graphite-300)",
                border: "1px solid var(--ember-orange)",
                fontSize: "0.85rem",
              }}
            >
              <strong>Total Combinations:</strong> {calculateTotalCombinations().toLocaleString()}
            </div>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: "0.9rem",
                marginBottom: "1rem",
                color: "var(--steel-200)",
                borderBottom: "1px solid var(--graphite-100)",
                paddingBottom: "0.5rem",
              }}
            >
              3. objective & constraints
            </h2>

            <div style={{ display: "grid", gap: "1rem" }}>
              <label>
                <span>Objective Metric</span>
                <select value={objective} onChange={(e) => setObjective(e.target.value)}>
                  <option value="sharpe">Sharpe Ratio</option>
                  <option value="sortino">Sortino Ratio</option>
                  <option value="cagr">CAGR</option>
                  <option value="total_return">Total Return</option>
                  <option value="profit_factor">Profit Factor</option>
                </select>
              </label>

              <label>
                <span>Min Trades</span>
                <input
                  type="number"
                  value={minTrades}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMinTrades(val === "" ? "" : Number(val));
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "") {
                      setMinTrades(10);
                    }
                  }}
                />
              </label>

              <label>
                <span>Max Drawdown (negative value, e.g., -0.3 for -30%)</span>
                <input
                  type="number"
                  value={maxDrawdown}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMaxDrawdown(val === "" ? "" : Number(val));
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "") {
                      setMaxDrawdown(-0.3);
                    }
                  }}
                  step="0.01"
                  max="0"
                />
              </label>
            </div>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: "0.9rem",
                marginBottom: "1rem",
                color: "var(--steel-200)",
                borderBottom: "1px solid var(--graphite-100)",
                paddingBottom: "0.5rem",
              }}
            >
              4. walk-forward validation (optional)
            </h2>

            <div style={{ display: "grid", gap: "1rem" }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
                <input
                  type="checkbox"
                  checked={enableWalkForward}
                  onChange={(e) => setEnableWalkForward(e.target.checked)}
                />
                <span>Enable Walk-Forward Analysis</span>
              </label>

              {enableWalkForward && (
                <>
                  <label>
                    <span>In-Sample Window (months)</span>
                    <input
                      type="number"
                      value={inSampleMonths}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInSampleMonths(val === "" ? "" : Number(val));
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") {
                          setInSampleMonths(12);
                        }
                      }}
                      min="1"
                    />
                  </label>
                  <label>
                    <span>Out-of-Sample Window (months)</span>
                    <input
                      type="number"
                      value={outSampleMonths}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOutSampleMonths(val === "" ? "" : Number(val));
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") {
                          setOutSampleMonths(3);
                        }
                      }}
                      min="1"
                    />
                  </label>
                </>
              )}
            </div>
          </section>

          <button
            onClick={handleSubmit}
            disabled={submitting || calculateTotalCombinations() === 0}
            style={{
              width: "100%",
              padding: "1rem",
              fontSize: "0.9rem",
              fontWeight: "700",
              background: submitting ? "var(--steel-400)" : "var(--ember-orange)",
              color: "white",
              border: "2px solid var(--ember-glow)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              boxShadow: "0 4px 16px rgba(255, 107, 53, 0.3)",
            }}
          >
            {submitting ? "Submitting..." : "Start Optimization"}
          </button>

          {notification && (
            <div
              style={{
                padding: "1rem 1.5rem",
                marginTop: "1rem",
                borderRadius: "4px",
                border: `1px solid ${notification.type === "error" ? "var(--danger-red)" : "var(--success-green)"}`,
                background:
                  notification.type === "error"
                    ? "rgba(239, 68, 68, 0.1)"
                    : "rgba(16, 185, 129, 0.1)",
                color: notification.type === "error" ? "var(--danger-red)" : "var(--success-green)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{notification.message}</span>
              <button
                onClick={() => setNotification(null)}
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
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div>
          <section>
            <h2
              style={{
                fontSize: "0.9rem",
                marginBottom: "1rem",
                color: "var(--steel-200)",
                borderBottom: "1px solid var(--graphite-100)",
                paddingBottom: "0.5rem",
              }}
            >
              optimization jobs
            </h2>

            <div style={{ display: "grid", gap: "0.5rem", marginBottom: "2rem" }}>
              {jobs.length === 0 && (
                <p
                  style={{
                    color: "var(--steel-400)",
                    fontSize: "0.85rem",
                    padding: "1rem",
                    textAlign: "center",
                  }}
                >
                  No optimization jobs yet
                </p>
              )}
              {jobs.map((job) => (
                <button
                  key={job.optId}
                  onClick={() => setSelectedJob(job.optId)}
                  style={{
                    padding: "1rem",
                    background:
                      selectedJob === job.optId ? "var(--graphite-200)" : "var(--graphite-400)",
                    border: `1px solid ${selectedJob === job.optId ? "var(--ember-orange)" : "var(--graphite-100)"}`,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: "600",
                        color: "var(--ember-orange)",
                      }}
                    >
                      {job.name}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.25rem 0.5rem",
                        background:
                          job.status === "completed"
                            ? "var(--success-green)"
                            : job.status === "failed"
                              ? "var(--danger-red)"
                              : job.status === "running"
                                ? "var(--spark-yellow)"
                                : "var(--steel-400)",
                        color: job.status === "running" ? "var(--graphite-500)" : "white",
                        textTransform: "uppercase",
                      }}
                    >
                      {job.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--steel-300)" }}>
                    <div>Strategy: {job.strategyName}</div>
                    <div>
                      Combinations: {job.totalCombinations} | Objective: {job.objective}
                    </div>
                    {job.bestScore && <div>Best Score: {job.bestScore.toFixed(4)}</div>}
                  </div>
                </button>
              ))}
            </div>

            {jobDetails && (
              <div>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    marginBottom: "1rem",
                    color: "var(--ember-orange)",
                  }}
                >
                  job details
                </h3>

                {jobDetails.status === "completed" && jobDetails.bestParams && (
                  <div
                    style={{
                      marginBottom: "1.5rem",
                      padding: "1rem",
                      background: "var(--graphite-300)",
                      border: "2px solid var(--success-green)",
                    }}
                  >
                    <h4
                      style={{
                        fontSize: "0.8rem",
                        marginBottom: "0.75rem",
                        color: "var(--success-green)",
                      }}
                    >
                      best parameters
                    </h4>
                    <div style={{ display: "grid", gap: "0.5rem", fontSize: "0.85rem" }}>
                      {Object.entries(jobDetails.bestParams).map(([key, value]) => (
                        <div key={key} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--steel-300)" }}>{key}:</span>
                          <span style={{ color: "var(--steel-100)", fontWeight: "600" }}>
                            {value}
                          </span>
                        </div>
                      ))}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "0.5rem",
                          paddingTop: "0.5rem",
                          borderTop: "1px solid var(--graphite-100)",
                        }}
                      >
                        <span style={{ color: "var(--ember-orange)", fontWeight: "700" }}>
                          {jobDetails.objective}:
                        </span>
                        <span style={{ color: "var(--ember-orange)", fontWeight: "700" }}>
                          {jobDetails.bestScore?.toFixed(4)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          JSON.stringify(jobDetails.bestParams, null, 2),
                        );
                        alert("Best parameters copied to clipboard!");
                      }}
                      style={{
                        width: "100%",
                        marginTop: "1rem",
                        padding: "0.75rem",
                        background: "var(--ember-orange)",
                        color: "white",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        textTransform: "uppercase",
                      }}
                    >
                      Copy Best Params to Clipboard
                    </button>
                  </div>
                )}

                {jobDetails.allResults && jobDetails.allResults.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    {(() => {
                      const withViolations = jobDetails.allResults.filter(
                        (r) => r.violations && r.violations.length > 0,
                      );
                      const validResults = jobDetails.allResults.filter(
                        (r) => !r.violations || r.violations.length === 0,
                      );
                      return withViolations.length > 0 ? (
                        <div
                          style={{
                            marginBottom: "1.5rem",
                            padding: "1rem",
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid var(--danger-red)",
                          }}
                        >
                          <h4
                            style={{
                              fontSize: "0.8rem",
                              marginBottom: "0.75rem",
                              color: "var(--danger-red)",
                            }}
                          >
                            ⚠ Constraint Violations
                          </h4>
                          <div style={{ fontSize: "0.85rem", color: "var(--steel-200)" }}>
                            <div>
                              {validResults.length} valid / {jobDetails.allResults.length} total
                              combinations
                            </div>
                            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
                              {withViolations.length > 0 && (
                                <div>
                                  Common violations:{" "}
                                  {Array.from(
                                    new Set(withViolations.flatMap((r) => r.violations || [])),
                                  )
                                    .slice(0, 3)
                                    .join("; ")}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    <h4
                      style={{
                        fontSize: "0.8rem",
                        marginBottom: "0.75rem",
                        color: "var(--steel-200)",
                      }}
                    >
                      all results ({jobDetails.allResults.length})
                    </h4>
                    <table
                      style={{
                        width: "100%",
                        fontSize: "0.75rem",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "var(--graphite-300)", textAlign: "left" }}>
                          <th
                            style={{
                              padding: "0.5rem",
                              borderBottom: "2px solid var(--ember-orange)",
                            }}
                          >
                            Rank
                          </th>
                          {jobDetails.allResults[0]?.params &&
                            Object.keys(jobDetails.allResults[0].params).map((key) => (
                              <th
                                key={key}
                                style={{
                                  padding: "0.5rem",
                                  borderBottom: "2px solid var(--ember-orange)",
                                }}
                              >
                                {key}
                              </th>
                            ))}
                          <th
                            style={{
                              padding: "0.5rem",
                              borderBottom: "2px solid var(--ember-orange)",
                            }}
                          >
                            Score
                          </th>
                          <th
                            style={{
                              padding: "0.5rem",
                              borderBottom: "2px solid var(--ember-orange)",
                            }}
                          >
                            Robustness
                          </th>
                          <th
                            style={{
                              padding: "0.5rem",
                              borderBottom: "2px solid var(--ember-orange)",
                            }}
                          >
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobDetails.allResults
                          .sort(
                            (a: CombinationResult, b: CombinationResult) =>
                              (b.robustnessScore ?? b.score) - (a.robustnessScore ?? a.score),
                          )
                          .slice(0, 50)
                          .map((result: CombinationResult, idx: number) => (
                            <tr
                              key={idx}
                              style={{
                                background:
                                  result.violations && result.violations.length > 0
                                    ? "rgba(239, 68, 68, 0.05)"
                                    : idx === 0
                                      ? "rgba(16, 185, 129, 0.1)"
                                      : "transparent",
                                borderBottom: "1px solid var(--graphite-100)",
                              }}
                            >
                              <td style={{ padding: "0.5rem" }}>{idx + 1}</td>
                              {Object.values(result.params).map((value, i) => (
                                <td key={i} style={{ padding: "0.5rem" }}>
                                  {value}
                                </td>
                              ))}
                              <td
                                style={{
                                  padding: "0.5rem",
                                  color: idx === 0 ? "var(--success-green)" : "var(--steel-100)",
                                  fontWeight: idx === 0 ? "700" : "400",
                                }}
                              >
                                {result.score.toFixed(4)}
                              </td>
                              <td style={{ padding: "0.5rem" }}>
                                {result.robustnessScore?.toFixed(4) ?? "-"}
                              </td>
                              <td
                                style={{
                                  padding: "0.5rem",
                                  color:
                                    result.violations && result.violations.length > 0
                                      ? "var(--danger-red)"
                                      : "var(--success-green)",
                                }}
                                title={result.violations?.join(", ") || "Valid"}
                              >
                                {result.violations && result.violations.length > 0
                                  ? `⚠ ${result.violations.length} violation${result.violations.length > 1 ? "s" : ""}`
                                  : "✓ Valid"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {jobDetails.walkForwardResults && (
                  <div style={{ marginTop: "2rem" }}>
                    <h4
                      style={{
                        fontSize: "0.8rem",
                        marginBottom: "0.75rem",
                        color: "var(--steel-200)",
                      }}
                    >
                      walk-forward results
                    </h4>
                    <div
                      style={{
                        padding: "1rem",
                        background: "var(--graphite-300)",
                        border: "1px solid var(--graphite-100)",
                        marginBottom: "1rem",
                      }}
                    >
                      <div style={{ fontSize: "0.85rem" }}>
                        <strong>Aggregate Out-of-Sample {jobDetails.objective}:</strong>{" "}
                        {jobDetails.walkForwardResults.aggregateOOS.score.toFixed(4)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
