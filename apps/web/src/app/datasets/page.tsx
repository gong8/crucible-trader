"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRoute } from "../../lib/api";

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

export default function DatasetsPage(): JSX.Element {
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1d");
  const [status, setStatus] = useState<string | null>(null);

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
    setStatus("registering dataset…");
    try {
      const response = await fetch(apiRoute("/api/datasets/fetch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "csv",
          symbol,
          timeframe,
          adjusted: true,
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

  return (
    <section className="grid" aria-label="datasets" style={{ gap: "1rem" }}>
      <header className="grid" style={{ gap: "0.5rem" }}>
        <h1 className="section-title">datasets</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          register local CSV files for the engine to consume.
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
            <select value={timeframe} onChange={(event) => setTimeframe(event.currentTarget.value)}>
              <option value="1d">1d</option>
              <option value="1h">1h</option>
              <option value="15m">15m</option>
              <option value="1m">1m</option>
            </select>
          </label>
        </div>
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
                <strong>
                  {dataset.symbol} · {dataset.timeframe}
                </strong>
                <span style={{ color: "#38bdf8" }}>{dataset.rows} rows</span>
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
