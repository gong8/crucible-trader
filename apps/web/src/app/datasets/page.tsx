"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRoute } from "../../lib/api";
import type { DataSource, Timeframe } from "@crucible-trader/sdk";

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

interface AvailableRange {
  readonly start: string;
  readonly end: string;
  readonly source: DataSource | "auto";
  readonly contributingSources: readonly string[];
}

const SUPPORTED_REMOTE_SOURCES: readonly DataSource[] = ["tiingo", "polygon"];

const computeAvailableRange = (
  datasets: readonly DatasetRecord[],
  symbol: string,
  timeframe: Timeframe,
  source: DataSource,
): AvailableRange | null => {
  const matching = datasets
    .filter(
      (record) =>
        record.symbol.toLowerCase() === symbol.toLowerCase() &&
        record.timeframe === timeframe &&
        record.start &&
        record.end,
    )
    .map((record) => ({
      source: record.source as DataSource,
      start: record.start!,
      end: record.end!,
    }));

  if (matching.length === 0) {
    return null;
  }

  if (source === "auto") {
    const remoteCandidates = matching.filter((record) =>
      SUPPORTED_REMOTE_SOURCES.includes(record.source),
    );
    const pool = remoteCandidates.length > 0 ? remoteCandidates : matching;
    const start = pool.reduce(
      (min, record) => (record.start < min ? record.start : min),
      pool[0]!.start,
    );
    const end = pool.reduce((max, record) => (record.end > max ? record.end : max), pool[0]!.end);
    const sources = Array.from(new Set(pool.map((record) => record.source)));
    return {
      start,
      end,
      source: "auto",
      contributingSources: sources,
    };
  }

  const candidate = matching.find((record) => record.source === source);
  if (!candidate) {
    return null;
  }

  return {
    start: candidate.start,
    end: candidate.end,
    source,
    contributingSources: [source],
  };
};

const createInitialRange = (): { start: string; end: string } => {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

export default function DatasetsPage(): JSX.Element {
  const initialRange = useMemo(() => createInitialRange(), []);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [source, setSource] = useState<DataSource>("auto");
  const [start, setStart] = useState(initialRange.start);
  const [end, setEnd] = useState(initialRange.end);
  const [adjusted, setAdjusted] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [datesLocked, setDatesLocked] = useState(false);

  const availableRange = useMemo(
    () => computeAvailableRange(datasets, symbol, timeframe, source),
    [datasets, symbol, timeframe, source],
  );

  // Sync dates with available range when it changes (default to max range, but allow editing)
  useEffect(() => {
    if (source === "csv") {
      setDatesLocked(false);
      return;
    }
    if (availableRange) {
      setDatesLocked(true); // Show indicator
      setStart(availableRange.start);
      setEnd(availableRange.end);
    } else {
      setDatesLocked(false);
      setStart(initialRange.start);
      setEnd(initialRange.end);
    }
  }, [availableRange, source, initialRange.start, initialRange.end]);

  const loadDatasets = useCallback(async () => {
    const response = await fetch(apiRoute("/api/datasets"), {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("unable to load datasets");
    }
    const payload = (await response.json()) as DatasetRecord[];
    setDatasets(Array.isArray(payload) ? payload : []);
  }, []);

  useEffect(() => {
    void loadDatasets().catch((error) => {
      console.error(error);
      setStatus("unable to load datasets");
    });
  }, [loadDatasets]);

  const handleFetch = async (): Promise<void> => {
    setStatus(source === "csv" ? "registering local dataset…" : "fetching remote dataset…");
    try {
      const response = await fetch(apiRoute("/api/datasets/fetch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          symbol,
          timeframe,
          start,
          end,
          adjusted,
        }),
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadDatasets();
      setStatus("dataset registered");
    } catch (error) {
      console.error(error);
      setStatus("dataset fetch failed");
    }
  };

  const handleDelete = async (record: DatasetRecord): Promise<void> => {
    setStatus(`removing ${record.symbol} ${record.timeframe}…`);
    try {
      const response = await fetch(apiRoute(`/api/datasets/${record.symbol}/${record.timeframe}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadDatasets();
      setStatus("dataset removed");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "";
      setStatus(message || "failed to delete dataset");
    }
  };

  return (
    <section className="grid" aria-label="datasets" style={{ gap: "1rem" }}>
      <header className="grid" style={{ gap: "0.5rem" }}>
        <h1 className="section-title">datasets</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          auto mode will reuse cached CSVs or fall back to Tiingo/Polygon as needed.
        </p>
        <p style={{ color: "#cbd5f5", fontSize: "0.8rem" }}>
          Tip: set <code>TIINGO_API_KEY</code> / <code>POLYGON_API_KEY</code> in <code>.env</code>{" "}
          when fetching remote datasets.
        </p>
      </header>

      <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={{ flex: 1 }}>
            symbol
            <input value={symbol} onChange={(event) => setSymbol(event.currentTarget.value)} />
          </label>
          <label style={{ flex: 1 }}>
            timeframe
            <select
              value={timeframe}
              onChange={(event) => setTimeframe(event.currentTarget.value as Timeframe)}
            >
              <option value="1d">1d</option>
              <option value="1h">1h</option>
              <option value="15m">15m</option>
              <option value="1m">1m</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={{ flex: 1 }}>
            source
            <select
              value={source}
              onChange={(event) => setSource(event.currentTarget.value as DataSource)}
            >
              <option value="auto">auto (prefer cached)</option>
              <option value="csv">csv (local file)</option>
              <option value="tiingo">tiingo (EOD)</option>
              <option value="polygon">polygon (intraday)</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            adjusted prices
            <select
              value={adjusted ? "true" : "false"}
              onChange={(event) => setAdjusted(event.currentTarget.value === "true")}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
        </div>
        {source !== "csv" ? (
          <>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <label style={{ flex: 1 }}>
                start date
                <input
                  type="date"
                  value={start}
                  onChange={(event) => setStart(event.currentTarget.value)}
                />
              </label>
              <label style={{ flex: 1 }}>
                end date
                <input
                  type="date"
                  value={end}
                  onChange={(event) => setEnd(event.currentTarget.value)}
                />
              </label>
            </div>
            {datesLocked && availableRange ? (
              <div
                style={{
                  padding: "0.75rem",
                  background: "#1e293b",
                  borderLeft: "3px solid #fbbf24",
                  fontSize: "0.75rem",
                  color: "#cbd5e1",
                }}
              >
                Available Range: {availableRange.start} → {availableRange.end} (
                {availableRange.source === "auto"
                  ? `auto via ${availableRange.contributingSources.join(", ")}`
                  : availableRange.source}
                )
              </div>
            ) : null}
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void handleFetch();
          }}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #38bdf8",
            background: "#0f172a",
            color: "#38bdf8",
            cursor: "pointer",
          }}
        >
          register dataset
        </button>
        {status ? <div className="alert">{status}</div> : null}
      </div>

      <div className="grid" style={{ gap: "0.5rem" }}>
        {datasets.length === 0 ? (
          <div className="alert">no datasets registered yet.</div>
        ) : (
          datasets.map((dataset) => (
            <article key={dataset.id} className="card" aria-label={`dataset ${dataset.symbol}`}>
              <header
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "grid" }}>
                  <strong>
                    {dataset.symbol} · {dataset.timeframe}
                  </strong>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{dataset.source}</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ color: "#38bdf8", fontSize: "0.9rem" }}>{dataset.rows} rows</span>
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        `Delete dataset ${dataset.symbol} ${dataset.timeframe}? This removes the cached CSV.`,
                      );
                      if (confirmed) {
                        void handleDelete(dataset);
                      }
                    }}
                    style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "0.35rem",
                      border: "1px solid #ef4444",
                      background: "#0f172a",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                  >
                    delete
                  </button>
                </div>
              </header>
              <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.5rem" }}>
                {dataset.start ?? "unknown"} → {dataset.end ?? "unknown"}
              </p>
              <p style={{ fontSize: "0.8rem", color: "#64748b" }}>{dataset.path}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
