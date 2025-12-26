"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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

interface StatTest {
  readonly id: number;
  readonly runId: string;
  readonly testType: string;
  readonly pValue: number | null;
  readonly confidenceLevel: number | null;
  readonly inSampleMetric: number | null;
  readonly outSampleMetric: number | null;
  readonly createdAt: string;
  readonly metadata: Record<string, unknown>;
}

const useStatTests = (
  runId: string | undefined,
): { tests: StatTest[]; loading: boolean; refresh: () => void } => {
  const [tests, setTests] = useState<StatTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    if (!runId) {
      setTests([]);
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const response = await fetch(apiRoute(`/api/stats/${runId}`), {
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch stat tests");
        }

        const data = (await response.json()) as StatTest[];
        if (!cancelled) {
          setTests(data);
        }
      } catch (error) {
        console.error("Failed to load stat tests", error);
        if (!cancelled) {
          setTests([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [runId, refreshCounter]);

  const refresh = (): void => {
    setRefreshCounter((prev) => prev + 1);
  };

  return { tests, loading, refresh };
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

const tabs = ["overview", "metrics", "stats", "datasets", "chart", "trades"] as const;
type Tab = (typeof tabs)[number];

export default function RunDetailPage(): JSX.Element {
  const params = useParams<{ runId: string }>();
  const { result, loading, error } = useRunDetail(params?.runId);
  const chartData = useChartData(result);
  const trades = useTrades(params?.runId);
  const {
    tests: statTests,
    loading: statsLoading,
    refresh: refreshStats,
  } = useStatTests(params?.runId);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [runningTest, setRunningTest] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: "2rem" }}>
      {/* HEADER */}
      <header>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            href="/runs"
            style={{
              fontSize: "0.8rem",
              color: "var(--steel-300)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            ← Back to runs
          </Link>
        </div>
        <h1 className="section-title" style={{ marginBottom: "0.75rem" }}>
          Run: {params?.runId ?? ""}
        </h1>
        {result ? (
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              flexWrap: "wrap",
              marginTop: "1rem",
            }}
          >
            {[
              {
                label: "Total PnL",
                value: formatCurrency(result.summary.total_pnl),
                highlight: true,
              },
              { label: "Sharpe", value: formatNumber(result.summary.sharpe) },
              { label: "Max DD", value: formatPercent(result.summary.max_dd) },
              { label: "Trades", value: formatInteger(result.summary.num_trades) },
            ].map((stat, idx) => (
              <div
                key={idx}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: stat.highlight
                    ? "linear-gradient(135deg, rgba(255, 107, 53, 0.15) 0%, rgba(255, 107, 53, 0.05) 100%)"
                    : "var(--graphite-400)",
                  border: `2px solid ${stat.highlight ? "var(--ember-orange)" : "var(--graphite-100)"}`,
                  borderRadius: "4px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--steel-400)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.35rem",
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: "700",
                    color: stat.highlight ? "var(--ember-orange)" : "var(--steel-100)",
                  }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </header>

      {/* LOADING & ERROR STATES */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <div className="loading" style={{ fontSize: "1.5rem" }}>
            Loading run details...
          </div>
        </div>
      ) : null}
      {error ? (
        <div
          className="alert"
          style={{
            borderLeft: "4px solid var(--danger-red)",
            background: "linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%)",
            color: "var(--danger-red)",
          }}
        >
          Error: {error}
        </div>
      ) : null}

      {/* TAB NAVIGATION */}
      {result ? (
        <>
          <nav
            style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              borderBottom: "2px solid var(--graphite-100)",
              paddingBottom: "0.5rem",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "0.65rem 1.25rem",
                  background:
                    activeTab === tab
                      ? "linear-gradient(135deg, var(--ember-dim) 0%, var(--ember-orange) 100%)"
                      : "transparent",
                  border: `2px solid ${activeTab === tab ? "var(--ember-orange)" : "var(--graphite-100)"}`,
                  borderRadius: "0",
                  color: activeTab === tab ? "white" : "var(--steel-300)",
                  textTransform: "uppercase",
                  fontSize: "0.75rem",
                  fontWeight: "700",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: activeTab === tab ? "0 4px 12px rgba(255, 107, 53, 0.3)" : "none",
                }}
              >
                {tab}
              </button>
            ))}
          </nav>

          {/* TAB CONTENT */}
          {activeTab === "overview" ? (
            <div className="card">
              <h2
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "700",
                  color: "var(--ember-orange)",
                  marginBottom: "1.5rem",
                  textTransform: "uppercase",
                }}
              >
                Overview
              </h2>

              {/* Strategy Info */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1rem",
                  marginBottom: "2rem",
                }}
              >
                <div
                  style={{
                    padding: "1rem",
                    background: "var(--graphite-500)",
                    borderLeft: "3px solid var(--ember-orange)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--steel-400)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    STRATEGY
                  </div>
                  <div style={{ fontSize: "1rem", fontWeight: "600" }}>
                    {result.request?.strategy.name ?? "unknown"}
                  </div>
                </div>
                <div
                  style={{
                    padding: "1rem",
                    background: "var(--graphite-500)",
                    borderLeft: "3px solid var(--steel-300)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--steel-400)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    SYMBOL
                  </div>
                  <div style={{ fontSize: "1rem", fontWeight: "600" }}>
                    {result.request?.data[0]?.symbol ?? "unknown"}
                  </div>
                </div>
                <div
                  style={{
                    padding: "1rem",
                    background: "var(--graphite-500)",
                    borderLeft: "3px solid var(--spark-yellow)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--steel-400)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    TIMEFRAME
                  </div>
                  <div style={{ fontSize: "1rem", fontWeight: "600" }}>
                    {result.request?.data[0]?.timeframe ?? "unknown"}
                  </div>
                </div>
              </div>

              {/* Chart */}
              {chartData ? (
                <div style={{ marginTop: "2rem" }}>
                  <h3
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: "700",
                      color: "var(--steel-200)",
                      marginBottom: "1rem",
                      textTransform: "uppercase",
                    }}
                  >
                    Equity Curve
                  </h3>
                  <LightweightChart equity={chartData.equity} markers={chartData.markers} />
                </div>
              ) : (
                <div className="alert">Chart data unavailable</div>
              )}
            </div>
          ) : null}

          {activeTab === "chart" ? (
            <div className="card">
              <h2
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "700",
                  color: "var(--ember-orange)",
                  marginBottom: "1.5rem",
                  textTransform: "uppercase",
                }}
              >
                Charts
              </h2>
              {chartData ? (
                <div style={{ display: "grid", gap: "2rem" }}>
                  <div>
                    <h3
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: "700",
                        color: "var(--steel-200)",
                        marginBottom: "1rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Equity Curve
                    </h3>
                    <LightweightChart equity={chartData.equity} markers={chartData.markers} />
                  </div>
                  {chartData.price ? (
                    <div>
                      <h3
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: "700",
                          color: "var(--steel-200)",
                          marginBottom: "1rem",
                          textTransform: "uppercase",
                        }}
                      >
                        Underlying Price
                      </h3>
                      <LightweightChart equity={chartData.price} markers={[]} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="alert">Chart data unavailable</div>
              )}
            </div>
          ) : null}

          {activeTab === "metrics" ? (
            <div className="card">
              <h2
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "700",
                  color: "var(--ember-orange)",
                  marginBottom: "1.5rem",
                  textTransform: "uppercase",
                }}
              >
                Performance Metrics
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "1rem",
                }}
              >
                {Object.entries(result.summary).map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      padding: "1.25rem",
                      background: "var(--graphite-500)",
                      border: "2px solid var(--graphite-100)",
                      borderRadius: "4px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--ember-orange)";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--graphite-100)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--steel-400)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {key.replace(/_/g, " ")}
                    </div>
                    <div
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: "700",
                        color: "var(--steel-100)",
                      }}
                    >
                      {typeof value === "number" ? value.toFixed(3) : value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "datasets" && result.request ? (
            <div className="card">
              <h2
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "700",
                  color: "var(--ember-orange)",
                  marginBottom: "1.5rem",
                  textTransform: "uppercase",
                }}
              >
                Configuration
              </h2>

              {/* Strategy */}
              <div style={{ marginBottom: "2rem" }}>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "700",
                    color: "var(--steel-200)",
                    marginBottom: "1rem",
                    textTransform: "uppercase",
                  }}
                >
                  Strategy
                </h3>
                <div
                  style={{
                    padding: "1rem",
                    background: "var(--graphite-500)",
                    borderLeft: "4px solid var(--ember-orange)",
                  }}
                >
                  <div style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.75rem" }}>
                    {result.request.strategy.name}
                  </div>
                  <pre
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.75rem",
                      background: "var(--graphite-400)",
                      border: "none",
                    }}
                  >
                    {JSON.stringify(result.request.strategy.params, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Datasets */}
              <div style={{ marginBottom: "2rem" }}>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "700",
                    color: "var(--steel-200)",
                    marginBottom: "1rem",
                    textTransform: "uppercase",
                  }}
                >
                  Data Sources
                </h3>
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {result.request.data.map((series, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "1rem",
                        background: "var(--graphite-500)",
                        borderLeft: "4px solid var(--spark-yellow)",
                      }}
                    >
                      <div style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
                        {series.symbol} · {series.timeframe}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--steel-300)" }}>
                        Source: {series.source} · {series.start ?? "?"} → {series.end ?? "?"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Costs & Risk */}
              <div>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "700",
                    color: "var(--steel-200)",
                    marginBottom: "1rem",
                    textTransform: "uppercase",
                  }}
                >
                  Execution Parameters
                </h3>
                <div
                  style={{
                    padding: "1rem",
                    background: "var(--graphite-500)",
                    borderLeft: "4px solid var(--steel-300)",
                  }}
                >
                  <div style={{ fontSize: "0.9rem", color: "var(--steel-200)", lineHeight: "1.8" }}>
                    <div>
                      Fees: <strong>{result.request.costs.feeBps} bps</strong>
                    </div>
                    <div>
                      Slippage: <strong>{result.request.costs.slippageBps} bps</strong>
                    </div>
                    <div>
                      Initial Cash: <strong>${result.request.initialCash.toLocaleString()}</strong>
                    </div>
                    {result.request.riskProfileId ? (
                      <div>
                        Risk Profile: <strong>{result.request.riskProfileId}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "trades" && trades && trades.length > 0 ? (
            <div className="card">
              <h2
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "700",
                  color: "var(--ember-orange)",
                  marginBottom: "1.5rem",
                  textTransform: "uppercase",
                }}
              >
                Trade History
              </h2>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "separate",
                    borderSpacing: "0 0.5rem",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--graphite-100)" }}>
                      <th
                        style={{
                          padding: "0.75rem",
                          textAlign: "left",
                          color: "var(--steel-300)",
                          textTransform: "uppercase",
                          fontSize: "0.7rem",
                        }}
                      >
                        Time
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          textAlign: "left",
                          color: "var(--steel-300)",
                          textTransform: "uppercase",
                          fontSize: "0.7rem",
                        }}
                      >
                        Side
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          textAlign: "right",
                          color: "var(--steel-300)",
                          textTransform: "uppercase",
                          fontSize: "0.7rem",
                        }}
                      >
                        Price
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          textAlign: "right",
                          color: "var(--steel-300)",
                          textTransform: "uppercase",
                          fontSize: "0.7rem",
                        }}
                      >
                        Qty
                      </th>
                      <th
                        style={{
                          padding: "0.75rem",
                          textAlign: "right",
                          color: "var(--steel-300)",
                          textTransform: "uppercase",
                          fontSize: "0.7rem",
                        }}
                      >
                        PnL
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, idx) => (
                      <tr
                        key={idx}
                        style={{
                          background: "var(--graphite-500)",
                        }}
                      >
                        <td
                          style={{
                            padding: "0.85rem",
                            borderLeft: "3px solid var(--graphite-100)",
                          }}
                        >
                          {new Date(trade.time).toLocaleString()}
                        </td>
                        <td style={{ padding: "0.85rem" }}>
                          <span
                            style={{
                              padding: "0.35rem 0.75rem",
                              borderRadius: "2px",
                              fontSize: "0.7rem",
                              fontWeight: "700",
                              background:
                                trade.side === "buy"
                                  ? "linear-gradient(135deg, #047857 0%, #10b981 100%)"
                                  : "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)",
                              color: "white",
                            }}
                          >
                            {trade.side.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "0.85rem", textAlign: "right", fontWeight: "600" }}>
                          ${trade.price.toFixed(2)}
                        </td>
                        <td style={{ padding: "0.85rem", textAlign: "right", fontWeight: "600" }}>
                          {trade.qty}
                        </td>
                        <td
                          style={{
                            padding: "0.85rem",
                            textAlign: "right",
                            fontWeight: "700",
                            color: trade.pnl >= 0 ? "var(--success-green)" : "var(--danger-red)",
                            borderRight: "3px solid var(--graphite-100)",
                          }}
                        >
                          {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === "trades" && trades && trades.length === 0 ? (
            <div className="alert">No trades executed in this run</div>
          ) : null}

          {/* STATS TAB */}
          {activeTab === "stats" ? (
            <div className="card">
              <h2
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "700",
                  color: "var(--ember-orange)",
                  marginBottom: "1.5rem",
                  textTransform: "uppercase",
                }}
              >
                Statistical Validation
              </h2>

              {/* Run Tests Section */}
              <div
                style={{
                  padding: "1.5rem",
                  background: "var(--graphite-500)",
                  border: "2px solid var(--ember-dim)",
                  borderRadius: "4px",
                  marginBottom: "2rem",
                }}
              >
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "700",
                    color: "var(--steel-200)",
                    marginBottom: "1rem",
                    textTransform: "uppercase",
                  }}
                >
                  Run Statistical Tests
                </h3>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <button
                    className="btn-primary"
                    disabled={runningTest !== null}
                    onClick={async () => {
                      if (!params?.runId) return;
                      setRunningTest("permutation");
                      try {
                        const response = await fetch(apiRoute("/api/stats/permutation"), {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({
                            runId: params.runId,
                            iterations: 1000,
                            metric: "sharpe",
                            seed: 42,
                            alpha: 0.05,
                          }),
                        });
                        if (!response.ok) {
                          throw new Error("Permutation test failed");
                        }
                        refreshStats();
                      } catch (error) {
                        console.error("Failed to run permutation test", error);
                        alert("Failed to run permutation test");
                      } finally {
                        setRunningTest(null);
                      }
                    }}
                    style={{ opacity: runningTest === "permutation" ? 0.6 : 1 }}
                  >
                    {runningTest === "permutation" ? "Running..." : "Permutation Test"}
                  </button>
                  <button
                    className="btn-primary"
                    disabled={runningTest !== null}
                    onClick={async () => {
                      if (!params?.runId) return;
                      setRunningTest("bootstrap");
                      try {
                        const response = await fetch(apiRoute("/api/stats/bootstrap"), {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({
                            runId: params.runId,
                            iterations: 1000,
                            metric: "sharpe",
                            seed: 42,
                            confidenceLevel: 0.95,
                          }),
                        });
                        if (!response.ok) {
                          throw new Error("Bootstrap test failed");
                        }
                        refreshStats();
                      } catch (error) {
                        console.error("Failed to run bootstrap test", error);
                        alert("Failed to run bootstrap test");
                      } finally {
                        setRunningTest(null);
                      }
                    }}
                    style={{ opacity: runningTest === "bootstrap" ? 0.6 : 1 }}
                  >
                    {runningTest === "bootstrap" ? "Running..." : "Bootstrap Analysis"}
                  </button>
                </div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--steel-400)",
                    marginTop: "1rem",
                  }}
                >
                  Statistical tests validate whether backtest results are statistically significant
                  or could be due to random chance.
                </p>
              </div>

              {/* Test Results */}
              {statsLoading ? (
                <div className="loading" style={{ textAlign: "center", padding: "2rem" }}>
                  Loading statistical tests...
                </div>
              ) : statTests.length === 0 ? (
                <div
                  className="alert"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(255, 210, 63, 0.1) 0%, transparent 100%)",
                    borderLeft: "4px solid var(--spark-yellow)",
                  }}
                >
                  No statistical tests run yet. Click a button above to run your first test.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "1.5rem" }}>
                  {statTests.map((test) => (
                    <div
                      key={test.id}
                      style={{
                        padding: "1.5rem",
                        background: "var(--graphite-500)",
                        border: `2px solid ${
                          test.testType === "permutation"
                            ? "var(--ember-orange)"
                            : "var(--spark-yellow)"
                        }`,
                        borderRadius: "4px",
                      }}
                    >
                      {/* Test Header */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "1.5rem",
                          flexWrap: "wrap",
                          gap: "1rem",
                        }}
                      >
                        <div>
                          <h3
                            style={{
                              fontSize: "1rem",
                              fontWeight: "700",
                              color: "var(--steel-100)",
                              marginBottom: "0.5rem",
                              textTransform: "uppercase",
                            }}
                          >
                            {test.testType === "permutation"
                              ? "Permutation Test"
                              : "🔄 Bootstrap Analysis"}
                          </h3>
                          <p style={{ fontSize: "0.75rem", color: "var(--steel-400)" }}>
                            {new Date(test.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {test.testType === "permutation" &&
                        test.metadata.isSignificant !== undefined ? (
                          <span
                            style={{
                              padding: "0.5rem 1rem",
                              borderRadius: "2px",
                              fontSize: "0.8rem",
                              fontWeight: "700",
                              background: test.metadata.isSignificant
                                ? "linear-gradient(135deg, #047857 0%, #10b981 100%)"
                                : "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)",
                              color: "white",
                            }}
                          >
                            {test.metadata.isSignificant ? "✓ SIGNIFICANT" : "✗ NOT SIGNIFICANT"}
                          </span>
                        ) : null}
                      </div>

                      {/* Test Results Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: "1rem",
                        }}
                      >
                        {test.testType === "permutation" ? (
                          <>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--steel-400)",
                                  marginBottom: "0.5rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                P-Value
                              </div>
                              <div
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "700",
                                  color: "var(--ember-orange)",
                                }}
                              >
                                {test.pValue?.toFixed(4) ?? "—"}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--steel-400)",
                                  marginBottom: "0.5rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                Z-Score
                              </div>
                              <div
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "700",
                                  color: "var(--steel-100)",
                                }}
                              >
                                {typeof test.metadata.zScore === "number"
                                  ? test.metadata.zScore.toFixed(2)
                                  : "—"}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--steel-400)",
                                  marginBottom: "0.5rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                Original Metric
                              </div>
                              <div
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "700",
                                  color: "var(--steel-100)",
                                }}
                              >
                                {test.inSampleMetric?.toFixed(3) ?? "—"}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--steel-400)",
                                  marginBottom: "0.5rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                Iterations
                              </div>
                              <div
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "700",
                                  color: "var(--steel-100)",
                                }}
                              >
                                {typeof test.metadata.iterations === "number"
                                  ? test.metadata.iterations.toLocaleString()
                                  : "—"}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--steel-400)",
                                  marginBottom: "0.5rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                Point Estimate
                              </div>
                              <div
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "700",
                                  color: "var(--spark-yellow)",
                                }}
                              >
                                {test.inSampleMetric?.toFixed(3) ?? "—"}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--steel-400)",
                                  marginBottom: "0.5rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                CI Lower
                              </div>
                              <div
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "700",
                                  color: "var(--steel-100)",
                                }}
                              >
                                {typeof test.metadata.ciLower === "number"
                                  ? test.metadata.ciLower.toFixed(3)
                                  : "—"}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--steel-400)",
                                  marginBottom: "0.5rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                CI Upper
                              </div>
                              <div
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "700",
                                  color: "var(--steel-100)",
                                }}
                              >
                                {typeof test.metadata.ciUpper === "number"
                                  ? test.metadata.ciUpper.toFixed(3)
                                  : "—"}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--steel-400)",
                                  marginBottom: "0.5rem",
                                  textTransform: "uppercase",
                                }}
                              >
                                Std Error
                              </div>
                              <div
                                style={{
                                  fontSize: "1.5rem",
                                  fontWeight: "700",
                                  color: "var(--steel-100)",
                                }}
                              >
                                {typeof test.metadata.standardError === "number"
                                  ? test.metadata.standardError.toFixed(4)
                                  : "—"}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Interpretation */}
                      <div
                        style={{
                          marginTop: "1.5rem",
                          padding: "1rem",
                          background: "var(--graphite-400)",
                          borderLeft: "4px solid var(--steel-300)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--steel-400)",
                            marginBottom: "0.5rem",
                            textTransform: "uppercase",
                          }}
                        >
                          Interpretation
                        </div>
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--steel-200)",
                            lineHeight: "1.6",
                          }}
                        >
                          {test.testType === "permutation" ? (
                            <>
                              The p-value of <strong>{test.pValue?.toFixed(4)}</strong> indicates{" "}
                              {test.metadata.isSignificant
                                ? "that the strategy performance is statistically significant and unlikely due to random chance."
                                : "that the strategy performance could be due to random chance. Consider testing with more data or different parameters."}
                            </>
                          ) : (
                            <>
                              The 95% confidence interval for{" "}
                              <strong>
                                {typeof test.metadata.metric === "string"
                                  ? test.metadata.metric
                                  : "the metric"}
                              </strong>{" "}
                              is [
                              {typeof test.metadata.ciLower === "number"
                                ? test.metadata.ciLower.toFixed(3)
                                : "?"}
                              ,{" "}
                              {typeof test.metadata.ciUpper === "number"
                                ? test.metadata.ciUpper.toFixed(3)
                                : "?"}
                              ]. The point estimate is{" "}
                              <strong>{test.inSampleMetric?.toFixed(3)}</strong> with standard error{" "}
                              {typeof test.metadata.standardError === "number"
                                ? test.metadata.standardError.toFixed(4)
                                : "?"}
                              .
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Download Report */}
          {result.artifacts.reportMd ? (
            <div style={{ textAlign: "center", marginTop: "2rem" }}>
              <a
                href={apiRoute(`/api/runs/${result.runId}/artifacts/report`)}
                target="_blank"
                rel="noreferrer"
              >
                <button className="btn-secondary">📄 Download Markdown Report</button>
              </a>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const formatCurrency = (value?: number): string => {
  if (typeof value !== "number") {
    return "—";
  }
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
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
