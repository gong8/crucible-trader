"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type { BacktestRequest, DataSource, MetricKey, Timeframe } from "@crucible-trader/sdk";
import { apiRoute } from "../../lib/api";

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

// Strategy presets with default parameters
const strategyPresets = {
  sma_crossover: {
    name: "SMA Crossover",
    description: "Moving average crossover (trend following)",
    params: { fastLength: 20, slowLength: 50 },
  },
  momentum: {
    name: "Momentum",
    description: "Price momentum breakout strategy",
    params: { lookback: 14, threshold: 0.02 },
  },
  mean_reversion: {
    name: "Mean Reversion",
    description: "Buy oversold, sell overbought",
    params: { period: 20, stdDevs: 2 },
  },
  breakout: {
    name: "Breakout",
    description: "High/low breakout with confirmation",
    params: { period: 20, minVolume: 1000000 },
  },
  chaos_trader: {
    name: "Chaos Trader",
    description: "Erratic high-frequency trading (for testing)",
    params: { volatilityThreshold: 0.005, tradeFrequency: 3 },
  },
} as const;

interface SubmissionState {
  status: "idle" | "success" | "error";
  message: string | null;
  runId?: string;
}

export default function NewRunPage(): JSX.Element {
  const [runName, setRunName] = useState("sma_aapl_trial");
  const [dataSource, setDataSource] = useState<DataSource>("auto");
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [start, setStart] = useState("2022-01-01");
  const [end, setEnd] = useState("2024-12-31");
  const [adjusted, setAdjusted] = useState(true);
  const [strategyName, setStrategyName] = useState("sma_crossover");
  const [strategyParams, setStrategyParams] = useState('{"fastLength": 20, "slowLength": 50}');
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
      strategyParams,
      feeBps,
      slippageBps,
      initialCash,
      seed,
      riskProfileId,
      selectedMetrics,
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
    strategyParams,
    feeBps,
    slippageBps,
    initialCash,
    seed,
    riskProfileId,
    selectedMetrics,
  ]);

  const handleMetricToggle = (metric: MetricKey): void => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((item) => item !== metric) : [...prev, metric],
    );
  };

  const handleStrategyPresetChange = (presetKey: string): void => {
    setStrategyName(presetKey);
    const preset = strategyPresets[presetKey as keyof typeof strategyPresets];
    if (preset) {
      setStrategyParams(JSON.stringify(preset.params, null, 2));
    }
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
      strategyParams,
      feeBps,
      slippageBps,
      initialCash,
      seed,
      riskProfileId,
      selectedMetrics,
    });

    if (!request || error) {
      setSubmission({ status: "error", message: error ?? "invalid request" });
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
          <label>
            run name
            <input
              value={runName}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setRunName(event.currentTarget.value)
              }
              required
            />
          </label>
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
                required
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
                required
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
                handleStrategyPresetChange(event.currentTarget.value)
              }
            >
              {Object.entries(strategyPresets).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.name} - {preset.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            strategy params (json)
            <textarea
              value={strategyParams}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setStrategyParams(event.currentTarget.value)
              }
              rows={4}
            />
          </label>
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

interface BuildArgs {
  runName: string;
  dataSource: DataSource;
  symbol: string;
  timeframe: Timeframe;
  start: string;
  end: string;
  adjusted: boolean;
  strategyName: string;
  strategyParams: string;
  feeBps: string;
  slippageBps: string;
  initialCash: string;
  seed: string;
  riskProfileId: string;
  selectedMetrics: MetricKey[];
}

function buildRequestSafely(args: BuildArgs): {
  request: BacktestRequest | null;
  error: string | null;
} {
  try {
    const params = args.strategyParams.trim().length
      ? JSON.parse(args.strategyParams)
      : ({} as Record<string, unknown>);

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
        params,
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
