"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import type { BacktestResult } from "@crucible-trader/sdk";

import { apiRoute } from "../../../lib/api";

const LightweightChart = dynamic(() => import("../../../components/lightweight-chart"), {
  ssr: false,
});

interface TradeMarker {
  readonly time: number;
  readonly side: "buy" | "sell";
  readonly price: number;
}

interface RunDetailState {
  readonly result: BacktestResult | null;
  readonly loading: boolean;
  readonly error: string | null;
}

interface ChartData {
  readonly equity: Array<{ time: number; value: number }>;
  readonly markers: TradeMarker[];
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
        const payload = (await response.json()) as BacktestResult;
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

const useChartData = (result: BacktestResult | null): ChartData | null => {
  const [data, setData] = useState<ChartData | null>(null);

  useEffect(() => {
    if (!result) {
      setData(null);
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const [equityRes, tradesRes] = await Promise.all([
          fetch(apiRoute(`/api/runs/${result.runId}/equity`), {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(apiRoute(`/api/runs/${result.runId}/trades`), {
            cache: "no-store",
            credentials: "include",
          }),
        ]);

        if (!equityRes.ok) {
          throw new Error("equity data missing");
        }

        const equityJson = (await equityRes.json()) as Array<{ time: string; equity: number }>;
        const tradesJson = tradesRes?.ok
          ? ((await tradesRes.json()) as Array<{ time: string; side: string; price: number }>)
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

        if (!cancelled) {
          setData({ equity: equitySeries, markers });
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

export default function RunDetailPage(): JSX.Element {
  const params = useParams<{ runId: string }>();
  const { result, loading, error } = useRunDetail(params?.runId);
  const chartData = useChartData(result);

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

      {result && chartData ? (
        <div className="card">
          <LightweightChart equity={chartData.equity} markers={chartData.markers} />
        </div>
      ) : result && !chartData && !loading ? (
        <div className="alert">chart data unavailable for this run</div>
      ) : null}
      {result?.artifacts.reportMd ? (
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
