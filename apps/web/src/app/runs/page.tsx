"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    let isMounted = true;

    const loadRuns = async (): Promise<void> => {
      try {
        const response = await fetch(apiRoute("/api/runs"), {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const payload = (await response.json()) as RunListItem[];
        if (isMounted) {
          setRuns(Array.isArray(payload) ? payload : []);
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
  }, []);

  return (
    <section className="grid" aria-label="run catalog">
      <header className="grid" style={{ gap: "0.5rem" }}>
        <h1 className="section-title">recent runs</h1>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
