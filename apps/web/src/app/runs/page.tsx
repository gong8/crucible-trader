"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiRoute } from "../../lib/api";

interface RunListItem {
  runId: string;
  createdAt?: string;
  status?: string;
}

export default function RunsPage(): JSX.Element {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const fetchRuns = useCallback(async (): Promise<RunListItem[]> => {
    const response = await fetch(apiRoute("/api/runs"), {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const payload = (await response.json()) as RunListItem[];
    return Array.isArray(payload) ? payload : [];
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRuns = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const payload = await fetchRuns();
        if (isMounted) {
          setRuns(payload);
        }
      } catch (err) {
        if (isMounted) {
          setError("unable to load runs");
        }
        console.error("runs fetch failed", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadRuns();

    return () => {
      isMounted = false;
    };
  }, [fetchRuns]);

  const handleReset = useCallback(async () => {
    const confirmed = window.confirm("Reset all stored runs and manifests?");
    if (!confirmed) {
      return;
    }
    setResetting(true);
    setLoading(true);
    try {
      const response = await fetch(apiRoute("/api/runs/reset"), {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const refreshedRuns = await fetchRuns();
      setRuns(refreshedRuns);
      setError(null);
    } catch (err) {
      setError("unable to reset runs");
      console.error("runs reset failed", err);
    } finally {
      setResetting(false);
      setLoading(false);
    }
  }, [fetchRuns]);

  return (
    <section className="grid" aria-label="run catalog">
      <header className="grid" style={{ gap: "0.75rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <h1 className="section-title" style={{ margin: 0 }}>
            recent runs
          </h1>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #334155",
              backgroundColor: "transparent",
              color: "#38bdf8",
              cursor: resetting ? "not-allowed" : "pointer",
              opacity: resetting ? 0.6 : 1,
              transition: "opacity 0.2s ease",
            }}
          >
            {resetting ? "resetting…" : "reset runs"}
          </button>
        </div>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          listing locally tracked runs from the crucible api.
        </p>
      </header>

      {loading ? (
        <div className="alert">loading run catalog…</div>
      ) : error ? (
        <div className="alert">{error}</div>
      ) : runs.length === 0 ? (
        <div className="card">
          no runs recorded yet. <Link href="/new-run">launch one</Link> to see the manifest trail.
        </div>
      ) : (
        <div className="grid">
          {runs.map((run) => (
            <article key={run.runId} className="card" aria-label={`run ${run.runId}`}>
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <strong>{run.runId}</strong>
                {run.status ? <span style={{ color: "#38bdf8" }}>{run.status}</span> : null}
              </div>
              <p style={{ marginTop: "0.5rem", color: "#94a3b8", fontSize: "0.85rem" }}>
                {run.createdAt ? `created ${run.createdAt}` : "timestamp pending"}
              </p>
              <div className="chart-placeholder" style={{ marginTop: "1rem" }}>
                chart placeholder
              </div>
              <div style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                <Link href={`/runs/${encodeURIComponent(run.runId)}`}>view manifest →</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
