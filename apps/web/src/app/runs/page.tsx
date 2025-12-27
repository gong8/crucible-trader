"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiRoute } from "../../lib/api";

interface RunListItem {
  runId: string;
  createdAt?: string;
  status?: string;
  name?: string;
  summary?: Record<string, number>;
  strategy?: string;
  symbol?: string;
}

export default function RunsPage(): JSX.Element {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Filtering, sorting, pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date-desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

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

  // Extract unique strategies and symbols for filter dropdowns
  const uniqueStrategies = Array.from(new Set(runs.map((r) => r.strategy).filter(Boolean)));
  const uniqueSymbols = Array.from(new Set(runs.map((r) => r.symbol).filter(Boolean)));

  // Filter and sort runs
  const filteredAndSortedRuns = runs
    .filter((run) => {
      // Search filter (name or runId)
      const matchesSearch =
        searchQuery === "" ||
        run.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        run.runId.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const matchesStatus = statusFilter === "all" || run.status === statusFilter;

      // Strategy filter
      const matchesStrategy = strategyFilter === "all" || run.strategy === strategyFilter;

      // Symbol filter
      const matchesSymbol = symbolFilter === "all" || run.symbol === symbolFilter;

      return matchesSearch && matchesStatus && matchesStrategy && matchesSymbol;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date-asc":
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        case "date-desc":
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case "name-asc":
          return (a.name || a.runId).localeCompare(b.name || b.runId);
        case "name-desc":
          return (b.name || b.runId).localeCompare(a.name || a.runId);
        case "sharpe-desc":
          return (b.summary?.sharpeRatio || 0) - (a.summary?.sharpeRatio || 0);
        case "sharpe-asc":
          return (a.summary?.sharpeRatio || 0) - (b.summary?.sharpeRatio || 0);
        case "pnl-desc":
          return (b.summary?.totalPnL || 0) - (a.summary?.totalPnL || 0);
        case "pnl-asc":
          return (a.summary?.totalPnL || 0) - (b.summary?.totalPnL || 0);
        default:
          return 0;
      }
    });

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedRuns.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRuns = filteredAndSortedRuns.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, strategyFilter, symbolFilter, sortBy]);

  return (
    <div style={{ display: "grid", gap: "2rem" }}>
      {/* HEADER */}
      <header>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "2rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 className="section-title">Run Catalog</h1>
            <p style={{ color: "var(--steel-200)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
              All backtests forged through the crucible
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="btn-secondary"
            style={{
              opacity: resetting ? 0.5 : 1,
            }}
          >
            {resetting ? "Resetting..." : "Reset Runs"}
          </button>
        </div>
      </header>

      {/* FILTERS AND CONTROLS */}
      {!loading && runs.length > 0 && (
        <div
          className="card"
          style={{
            padding: "1.5rem",
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "0.6rem 1rem",
              background: "var(--graphite-300)",
              border: "1px solid var(--graphite-100)",
              color: "var(--steel-100)",
              fontSize: "0.9rem",
            }}
          />

          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            style={{
              padding: "0.6rem 1rem",
              background: "var(--graphite-300)",
              border: "1px solid var(--graphite-100)",
              color: "var(--steel-100)",
              fontSize: "0.9rem",
            }}
          >
            <option value="all">All Strategies</option>
            {uniqueStrategies.map((strategy) => (
              <option key={strategy} value={strategy}>
                {strategy}
              </option>
            ))}
          </select>

          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            style={{
              padding: "0.6rem 1rem",
              background: "var(--graphite-300)",
              border: "1px solid var(--graphite-100)",
              color: "var(--steel-100)",
              fontSize: "0.9rem",
            }}
          >
            <option value="all">All Symbols</option>
            {uniqueSymbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "0.6rem 1rem",
              background: "var(--graphite-300)",
              border: "1px solid var(--graphite-100)",
              color: "var(--steel-100)",
              fontSize: "0.9rem",
            }}
          >
            <option value="all">All Status</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: "0.6rem 1rem",
              background: "var(--graphite-300)",
              border: "1px solid var(--graphite-100)",
              color: "var(--steel-100)",
              fontSize: "0.9rem",
            }}
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="sharpe-desc">Sharpe (High-Low)</option>
            <option value="sharpe-asc">Sharpe (Low-High)</option>
            <option value="pnl-desc">PnL (High-Low)</option>
            <option value="pnl-asc">PnL (Low-High)</option>
          </select>
        </div>
      )}

      {/* CONTENT */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <div className="loading" style={{ fontSize: "1.5rem" }}>
            Loading runs...
          </div>
        </div>
      ) : error ? (
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
      ) : runs.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "4rem 2rem",
            background: "linear-gradient(135deg, var(--graphite-400) 0%, var(--graphite-300) 100%)",
          }}
        >
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: "700",
              color: "var(--steel-100)",
              marginBottom: "0.5rem",
            }}
          >
            No runs in the forge yet
          </h3>
          <p style={{ color: "var(--steel-300)", marginBottom: "1.5rem" }}>
            Ready to test your strategy under fire?
          </p>
          <Link href="/new-run">
            <button className="btn-primary">Create Your First Run</button>
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {paginatedRuns.map((run) => (
            <article
              key={run.runId}
              className="card"
              style={{
                display: "grid",
                gap: "1.25rem",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Status Badge */}
              {run.status ? (
                <div
                  style={{
                    position: "absolute",
                    top: "1rem",
                    right: "1rem",
                    padding: "0.35rem 0.85rem",
                    background:
                      run.status === "completed"
                        ? "linear-gradient(135deg, #059669 0%, #10b981 100%)"
                        : run.status === "running"
                          ? "linear-gradient(135deg, var(--ember-dim) 0%, var(--ember-orange) 100%)"
                          : "linear-gradient(135deg, var(--steel-400) 0%, var(--steel-300) 100%)",
                    color: "white",
                    fontSize: "0.7rem",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderRadius: "2px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  {run.status}
                </div>
              ) : null}

              {/* Run Info */}
              <div>
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: "700",
                    color: "var(--steel-100)",
                    marginBottom: "0.35rem",
                    textTransform: "none",
                  }}
                >
                  {run.name ?? run.runId}
                </h3>
                <p
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--steel-400)",
                    fontFamily: "JetBrains Mono, monospace",
                    letterSpacing: "0.02em",
                  }}
                >
                  {run.runId}
                </p>
                {run.createdAt ? (
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--steel-300)",
                      marginTop: "0.5rem",
                    }}
                  >
                    {new Date(run.createdAt).toLocaleString()}
                  </p>
                ) : null}
              </div>

              {/* Metrics Grid */}
              {run.summary && Object.keys(run.summary).length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "0.75rem",
                    padding: "1rem",
                    background: "var(--graphite-500)",
                    borderRadius: "4px",
                    border: "1px solid var(--graphite-100)",
                  }}
                >
                  {Object.entries(run.summary)
                    .slice(0, 4)
                    .map(([metric, value]) => (
                      <div key={`${run.runId}-${metric}`}>
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "var(--steel-400)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: "0.25rem",
                          }}
                        >
                          {metric.replace(/_/g, " ")}
                        </div>
                        <div
                          style={{
                            fontSize: "1.1rem",
                            fontWeight: "700",
                            color:
                              metric.includes("pnl") || metric.includes("return")
                                ? Number(value) >= 0
                                  ? "var(--success-green)"
                                  : "var(--danger-red)"
                                : "var(--steel-100)",
                          }}
                        >
                          {Number(value).toFixed(3)}
                        </div>
                      </div>
                    ))}
                </div>
              ) : null}

              {/* Actions */}
              <Link href={`/runs/${encodeURIComponent(run.runId)}`} style={{ marginTop: "auto" }}>
                <button
                  className="btn-secondary"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                  }}
                >
                  View Details →
                </button>
              </Link>
            </article>
          ))}
        </div>
      )}

      {/* PAGINATION */}
      {!loading && filteredAndSortedRuns.length > 0 && totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "1rem",
            padding: "1rem",
          }}
        >
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="btn-secondary"
            style={{
              opacity: currentPage === 1 ? 0.5 : 1,
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>

          <span style={{ color: "var(--steel-200)", fontSize: "0.9rem" }}>
            Page {currentPage} of {totalPages} ({filteredAndSortedRuns.length} runs)
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="btn-secondary"
            style={{
              opacity: currentPage === totalPages ? 0.5 : 1,
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
