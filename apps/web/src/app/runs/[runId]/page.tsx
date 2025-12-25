"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import type { BacktestRequest, BacktestResult } from "@crucible-trader/sdk";

import { apiRoute } from "../../../lib/api";

const LightweightChart = dynamic(() => import("../../../components/lightweight-chart"), {
  ssr: false,
});

interface TradeMarker {
  readonly time: number;
  readonly side: "buy" | "sell";
  readonly price: number;
}

interface Trade {
  readonly time: string;
  readonly side: "buy" | "sell";
  readonly price: number;
  readonly qty: number;
  readonly pnl: number;
}

interface RunDetailResponse extends BacktestResult {
  readonly request?: BacktestRequest;
}

interface RunDetailState {
  readonly result: RunDetailResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
}

interface ChartData {
  readonly equity: Array<{ time: number; value: number }>;
  readonly markers: TradeMarker[];
  readonly price?: Array<{ time: number; value: number }>;
}

const initialState: RunDetailState = {
  result: null,
  loading: true,
  error: null,
};

const useRunDetail = (runId: string | undefined): RunDetailState => {
  const [state, setState] = useState<RunDetailState>(initialState);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const response = await fetch(apiRoute(`/api/runs/${runId}`), {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const payload = (await response.json()) as RunDetailResponse;
        if (!cancelled) {
          setState({ result: payload, loading: false, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            result: null,
            loading: false,
            error: error instanceof Error ? error.message : "unknown error",
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  return state;
};

const useChartData = (result: RunDetailResponse | null): ChartData | null => {
  const [data, setData] = useState<ChartData | null>(null);

  useEffect(() => {
    if (!result) {
      setData(null);
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const [equityRes, tradesRes, barsRes] = await Promise.all([
          fetch(apiRoute(`/api/runs/${result.runId}/equity`), {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(apiRoute(`/api/runs/${result.runId}/trades`), {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(apiRoute(`/api/runs/${result.runId}/bars`), {
            cache: "no-store",
            credentials: "include",
          }).catch(() => undefined),
        ]);

        if (!equityRes.ok) {
          throw new Error("equity data missing");
        }

        const equityJson = (await equityRes.json()) as Array<{ time: string; equity: number }>;
        const tradesJson = tradesRes?.ok
          ? ((await tradesRes.json()) as Array<{ time: string; side: string; price: number }>)
          : [];
        const priceJson = barsRes?.ok
          ? ((await barsRes.json()) as Array<{ time: string; close: number }>)
          : [];

        const equitySeries = equityJson.map((row) => ({
          time: toUnix(row.time),
          value: Number(row.equity ?? 0),
        }));

        const markers: TradeMarker[] = tradesJson.length
          ? tradesJson.map((row) => ({
              time: toUnix(row.time),
              side: row.side === "sell" ? "sell" : "buy",
              price: Number(row.price ?? 0),
            }))
          : createMockMarkers(equitySeries);

        const priceSeries = priceJson.map((row) => ({
          time: toUnix(row.time),
          value: Number(row.close ?? 0),
        }));

        if (!cancelled) {
          setData({
            equity: equitySeries,
            markers,
            price: priceSeries.length ? priceSeries : undefined,
          });
        }
      } catch (error) {
        console.error("Failed to load chart data", error);
        if (!cancelled) {
          setData(null);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [result]);

  return data;
};

const useTrades = (runId: string | undefined): Trade[] | null => {
  const [trades, setTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    if (!runId) {
      setTrades(null);
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const response = await fetch(apiRoute(`/api/runs/${runId}/trades`), {
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("trades data missing");
        }

        const data = (await response.json()) as Array<{
          time: string;
          side: string;
          price: number;
          qty: number;
          pnl: number;
        }>;

        if (!cancelled) {
          setTrades(
            data.map((row) => ({
              time: row.time,
              side: row.side === "sell" ? "sell" : "buy",
              price: Number(row.price ?? 0),
              qty: Number(row.qty ?? 0),
              pnl: Number(row.pnl ?? 0),
            })),
          );
        }
      } catch (error) {
        console.error("Failed to load trades", error);
        if (!cancelled) {
          setTrades([]);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  return trades;
};

const createMockMarkers = (equity: Array<{ time: number; value: number }>): TradeMarker[] => {
  if (equity.length === 0) {
    return [];
  }
  const first = equity[0];
  const last = equity[equity.length - 1];
  if (!first || !last) {
    return [];
  }
  return [
    { time: first.time, side: "buy", price: first.value },
    { time: last.time, side: "sell", price: last.value },
  ];
};

const toUnix = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }
  return Math.floor(Date.now() / 1000);
};

const tabs = ["overview", "metrics", "datasets", "chart", "trades"] as const;
type Tab = (typeof tabs)[number];

export default function RunDetailPage(): JSX.Element {
  const params = useParams<{ runId: string }>();
  const { result, loading, error } = useRunDetail(params?.runId);
  const chartData = useChartData(result);
  const trades = useTrades(params?.runId);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <section className="grid" aria-label="run detail" style={{ gap: "1.5rem" }}>
      <header className="grid" style={{ gap: "0.5rem" }}>
        <h1 className="section-title">run {params?.runId ?? ""}</h1>
        {result ? (
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            metrics:{" "}
            {Object.entries(result.summary)
              .map(([key, value]) => `${key}: ${value.toFixed?.(3) ?? value}`)
              .join(", ")}
          </p>
        ) : null}
      </header>

      {loading ? <div className="alert">loading run…</div> : null}
      {error ? <div className="alert">{error}</div> : null}

      <nav
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid",
              borderColor: activeTab === tab ? "#38bdf8" : "#1e293b",
              background: activeTab === tab ? "#1e293b" : "transparent",
              color: activeTab === tab ? "#38bdf8" : "#94a3b8",
              textTransform: "uppercase",
              fontSize: "0.75rem",
              letterSpacing: "0.05em",
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && result ? (
        <div className="card" style={{ display: "grid", gap: "1.25rem" }}>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Stat label="Strategy" value={result.request?.strategy.name ?? "unknown"} />
            <Stat label="Symbol" value={result.request?.data[0]?.symbol ?? "unknown"} />
            <Stat label="Timeframe" value={result.request?.data[0]?.timeframe ?? "unknown"} />
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Stat label="Total PnL" value={formatCurrency(result.summary.total_pnl)} />
            <Stat label="Total Return" value={formatPercent(result.summary.total_return)} />
            <Stat label="Sharpe" value={formatNumber(result.summary.sharpe)} />
            <Stat label="Trades" value={formatInteger(result.summary.num_trades)} />
          </div>
          {chartData ? (
            <LightweightChart equity={chartData.equity} markers={chartData.markers} />
          ) : (
            <div className="alert">chart data unavailable for this run</div>
          )}
        </div>
      ) : null}

      {activeTab === "chart" && result && chartData ? (
        <div className="card" style={{ display: "grid", gap: "1rem" }}>
          <section>
            <h2 className="section-title">equity curve</h2>
            <LightweightChart equity={chartData.equity} markers={chartData.markers} />
          </section>
          {chartData.price ? (
            <section>
              <h2 className="section-title">underlying price</h2>
              <LightweightChart equity={chartData.price} markers={[]} />
            </section>
          ) : null}
        </div>
      ) : activeTab === "chart" && result && !chartData && !loading ? (
        <div className="alert">chart data unavailable for this run</div>
      ) : null}

      {activeTab === "datasets" && result?.request ? (
        <div className="card" style={{ display: "grid", gap: "1rem" }}>
          <section>
            <h2 className="section-title">strategy</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{result.request.strategy.name}</p>
            <pre style={{ background: "#0f172a", padding: "0.5rem", borderRadius: "0.5rem" }}>
              {JSON.stringify(result.request.strategy.params, null, 2)}
            </pre>
          </section>

          <section>
            <h2 className="section-title">datasets</h2>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {result.request.data.map((series) => (
                <article key={`${series.symbol}-${series.timeframe}`}>
                  <strong>
                    {series.symbol} · {series.timeframe}
                  </strong>
                  <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                    source: {series.source} · {series.start ?? "?"} → {series.end ?? "?"}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h2 className="section-title">costs & risk</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              fees: {result.request.costs.feeBps} bps · slippage: {result.request.costs.slippageBps}{" "}
              bps · initial cash: ${result.request.initialCash.toLocaleString()}
            </p>
            {result.request.riskProfileId ? (
              <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                risk profile: {result.request.riskProfileId}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {activeTab === "trades" && trades && trades.length > 0 ? (
        <div className="card">
          <h2 className="section-title" style={{ marginBottom: "1rem" }}>
            trade history
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #334155" }}>
                  <th style={{ padding: "0.75rem", textAlign: "left", color: "#94a3b8" }}>Time</th>
                  <th style={{ padding: "0.75rem", textAlign: "left", color: "#94a3b8" }}>Side</th>
                  <th style={{ padding: "0.75rem", textAlign: "right", color: "#94a3b8" }}>
                    Price
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "right", color: "#94a3b8" }}>Qty</th>
                  <th style={{ padding: "0.75rem", textAlign: "right", color: "#94a3b8" }}>PnL</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: "1px solid #1e293b",
                    }}
                  >
                    <td style={{ padding: "0.75rem" }}>{new Date(trade.time).toLocaleString()}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <span
                        style={{
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          backgroundColor: trade.side === "buy" ? "#166534" : "#991b1b",
                          color: trade.side === "buy" ? "#86efac" : "#fca5a5",
                        }}
                      >
                        {trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right" }}>
                      ${trade.price.toFixed(2)}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right" }}>{trade.qty}</td>
                    <td
                      style={{
                        padding: "0.75rem",
                        textAlign: "right",
                        color: trade.pnl >= 0 ? "#86efac" : "#fca5a5",
                        fontWeight: 600,
                      }}
                    >
                      ${trade.pnl >= 0 ? "+" : ""}
                      {trade.pnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "trades" && trades && trades.length === 0 ? (
        <div className="alert">no trades executed in this run</div>
      ) : null}

      {activeTab === "metrics" && result ? (
        <div className="card">
          <h2 className="section-title">metrics</h2>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
              gap: "0.75rem",
            }}
          >
            {Object.entries(result.summary).map(([key, value]) => (
              <div
                key={key}
                style={{ background: "#0f172a", padding: "0.75rem", borderRadius: "0.5rem" }}
              >
                <dt style={{ textTransform: "uppercase", color: "#94a3b8", fontSize: "0.75rem" }}>
                  {key}
                </dt>
                <dd style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                  {typeof value === "number" ? value.toFixed(3) : value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {activeTab === "overview" && result?.artifacts.reportMd ? (
        <div>
          <a
            href={apiRoute(`/api/runs/${result.runId}/artifacts/report`)}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#38bdf8" }}
          >
            download markdown report →
          </a>
        </div>
      ) : null}
    </section>
  );
}

const Stat = ({ label, value }: { label: string; value: string }): JSX.Element => {
  return (
    <div style={{ background: "#0f172a", padding: "0.75rem 1rem", borderRadius: "0.75rem" }}>
      <div style={{ color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>{value}</div>
    </div>
  );
};

const formatCurrency = (value?: number): string => {
  if (typeof value !== "number") {
    return "—";
  }
  return `${value >= 0 ? "+" : ""}$${value.toFixed(2)}`;
};

const formatPercent = (value?: number): string => {
  if (typeof value !== "number") {
    return "—";
  }
  return `${(value * 100).toFixed(2)}%`;
};

const formatNumber = (value?: number): string => {
  if (typeof value !== "number") {
    return "—";
  }
  return value.toFixed(2);
};

const formatInteger = (value?: number): string => {
  if (typeof value !== "number") {
    return "—";
  }
  return Math.round(value).toString();
};
