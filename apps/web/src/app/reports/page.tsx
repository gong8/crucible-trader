"use client";

import { useEffect, useState } from "react";

import { apiRoute } from "../../lib/api";
import { Alert } from "../../components";

interface RunSummary {
  readonly runId: string;
  readonly name?: string;
  readonly summary?: Record<string, number>;
}

export default function ReportsPage(): JSX.Element {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(apiRoute("/api/runs"), {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("unable to load runs");
        }
        const payload = (await response.json()) as RunSummary[];
        setRuns(Array.isArray(payload) ? payload : []);
      } catch (err) {
        console.error(err);
        setError("unable to load run summaries");
      }
    };
    void load();
  }, []);

  return (
    <section className="grid" aria-label="reports" style={{ gap: "1rem" }}>
      <header className="grid" style={{ gap: "0.5rem" }}>
        <h1 className="section-title">reports</h1>
        <p style={{ color: "var(--steel-200)", fontSize: "0.9rem" }}>
          inspect run metrics and download markdown manifests.
        </p>
      </header>
      {error ? <Alert type="error">{error}</Alert> : null}
      {runs.length === 0 ? (
        <Alert type="warning">no runs recorded yet.</Alert>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>run</th>
                <th style={{ textAlign: "left" }}>sharpe</th>
                <th style={{ textAlign: "left" }}>max dd</th>
                <th style={{ textAlign: "left" }}>cagr</th>
                <th style={{ textAlign: "left" }}>report</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.runId}>
                  <td>
                    <a href={`/runs/${encodeURIComponent(run.runId)}`}>{run.name ?? run.runId}</a>
                  </td>
                  <td>{formatMetric(run.summary?.sharpe)}</td>
                  <td>{formatMetric(run.summary?.max_dd)}</td>
                  <td>{formatMetric(run.summary?.cagr)}</td>
                  <td>
                    <a
                      href={apiRoute(`/api/runs/${run.runId}/artifacts/report`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      report
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const formatMetric = (value?: number): string => {
  if (typeof value !== "number") {
    return "—";
  }
  return value.toFixed(3);
};
