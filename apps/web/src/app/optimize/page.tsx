"use client";

import { useState, useEffect } from "react";
import { strategyConfigs, type StrategyKey } from "@crucible-trader/sdk";

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
  const [strategyName, setStrategyName] = useState<StrategyKey>("sma_crossover");
  const [paramGrid, setParamGrid] = useState<Record<string, ParamGridValue>>({});
  const [objective, setObjective] = useState("sharpe");
  const [minTrades, setMinTrades] = useState(10);
  const [maxDrawdown, setMaxDrawdown] = useState(-0.3);
  const [enableWalkForward, setEnableWalkForward] = useState(false);
  const [inSampleMonths, setInSampleMonths] = useState(12);
  const [outSampleMonths, setOutSampleMonths] = useState(3);
  const [symbol, setSymbol] = useState("AAPL");
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [initialCash, setInitialCash] = useState(100000);
  const [jobName, setJobName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
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

  // Initialize param grid when strategy changes
  useEffect(() => {
    const initialGrid: Record<string, ParamGridValue> = {};
    strategy.fields.forEach((field) => {
      const defaultValue = strategy.defaults[field.key] as number;
      initialGrid[field.key] = {
        type: "discrete",
        discrete: [defaultValue],
      };
    });
    setParamGrid(initialGrid);
  }, [strategyName, strategy]);

  // Fetch optimization jobs
  useEffect(() => {
    const fetchJobs = async (): Promise<void> => {
      try {
        const response = await fetch("/api/optimize");
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
        const response = await fetch(`/api/optimize/${selectedJob}`);
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

  const updateDiscreteValue = (paramKey: string, index: number, value: number): void => {
    const current = paramGrid[paramKey];
    if (current?.type === "discrete" && current.discrete) {
      const updated = [...current.discrete];
      updated[index] = value;
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
    const field = strategy.fields.find((f) => f.key === paramKey);
    setParamGrid({
      ...paramGrid,
      [paramKey]: {
        type: "range",
        range: {
          min: field?.min ?? 1,
          max: field?.max ?? 100,
          step: field?.step ?? 1,
        },
      },
    });
  };

  const switchToDiscrete = (paramKey: string): void => {
    const defaultValue = strategy.defaults[paramKey] as number;
    setParamGrid({
      ...paramGrid,
      [paramKey]: {
        type: "discrete",
        discrete: [defaultValue],
      },
    });
  };

  const updateRange = (paramKey: string, field: keyof ParamRange, value: number): void => {
    const current = paramGrid[paramKey];
    if (current?.type === "range" && current.range) {
      setParamGrid({
        ...paramGrid,
        [paramKey]: {
          ...current,
          range: {
            ...current.range,
            [field]: value,
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
    try {
      // Convert param grid to API format
      const apiParamGrid: Record<string, number[] | ParamRange> = {};
      Object.entries(paramGrid).forEach(([key, value]) => {
        if (value.type === "discrete" && value.discrete) {
          apiParamGrid[key] = value.discrete;
        } else if (value.type === "range" && value.range) {
          apiParamGrid[key] = value.range;
        }
      });

      const request = {
        name: jobName || `Optimize ${strategyName} - ${new Date().toLocaleString()}`,
        baseRequest: {
          runName: `opt-${strategyName}`,
          data: [
            {
              source: "csv",
              symbol,
              timeframe: "1d",
              start: startDate,
              end: endDate,
              adjusted: true,
            },
          ],
          costs: {
            feeBps: 1,
            slippageBps: 2,
          },
          initialCash,
          seed: 42,
        },
        strategy: {
          name: strategyName,
        },
        paramGrid: apiParamGrid,
        objective,
        constraints: {
          minTrades,
          maxDrawdown,
        },
        ...(enableWalkForward && {
          walkForward: {
            inSampleMonths,
            outSampleMonths,
            anchored: false,
          },
        }),
      };

      const response = await fetch("/api/optimize/grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Optimization job created: ${data.optId}`);
        setSelectedJob(data.optId);
      } else {
        const error = await response.json();
        alert(`Failed to create optimization: ${error.error}`);
      }
    } catch (error) {
      alert(`Error: ${error}`);
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
                  {Object.values(strategyConfigs).map((config) => (
                    <option key={config.key} value={config.key}>
                      {config.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Symbol</span>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
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
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
              </div>

              <label>
                <span>Initial Cash</span>
                <input
                  type="number"
                  value={initialCash}
                  onChange={(e) => setInitialCash(Number(e.target.value))}
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

            {strategy.fields.map((field) => {
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
                            onChange={(e) =>
                              updateDiscreteValue(field.key, idx, Number(e.target.value))
                            }
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
                      style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}
                    >
                      <label>
                        <span style={{ fontSize: "0.7rem" }}>Min</span>
                        <input
                          type="number"
                          value={gridValue.range.min}
                          onChange={(e) => updateRange(field.key, "min", Number(e.target.value))}
                          step={field.step}
                        />
                      </label>
                      <label>
                        <span style={{ fontSize: "0.7rem" }}>Max</span>
                        <input
                          type="number"
                          value={gridValue.range.max}
                          onChange={(e) => updateRange(field.key, "max", Number(e.target.value))}
                          step={field.step}
                        />
                      </label>
                      <label>
                        <span style={{ fontSize: "0.7rem" }}>Step</span>
                        <input
                          type="number"
                          value={gridValue.range.step}
                          onChange={(e) => updateRange(field.key, "step", Number(e.target.value))}
                          step={field.step}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}

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
                  onChange={(e) => setMinTrades(Number(e.target.value))}
                />
              </label>

              <label>
                <span>Max Drawdown (negative value, e.g., -0.3 for -30%)</span>
                <input
                  type="number"
                  value={maxDrawdown}
                  onChange={(e) => setMaxDrawdown(Number(e.target.value))}
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
                      onChange={(e) => setInSampleMonths(Number(e.target.value))}
                      min="1"
                    />
                  </label>
                  <label>
                    <span>Out-of-Sample Window (months)</span>
                    <input
                      type="number"
                      value={outSampleMonths}
                      onChange={(e) => setOutSampleMonths(Number(e.target.value))}
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
                                background: idx === 0 ? "rgba(16, 185, 129, 0.1)" : "transparent",
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
