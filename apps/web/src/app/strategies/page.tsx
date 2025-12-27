"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Strategy {
  id: string;
  name: string;
  description: string;
  type: "preset" | "custom";
  version?: string;
  author?: string;
  tags?: string[];
  favorite?: boolean;
}

const PRESET_STRATEGIES: Strategy[] = [
  {
    id: "sma_crossover",
    name: "SMA Crossover",
    description: "Simple Moving Average crossover strategy",
    type: "preset",
  },
  {
    id: "momentum",
    name: "Momentum",
    description: "Momentum-based trend following strategy",
    type: "preset",
  },
  {
    id: "mean_reversion",
    name: "Mean Reversion",
    description: "Z-score based mean reversion strategy",
    type: "preset",
  },
  {
    id: "breakout",
    name: "Breakout",
    description: "Range breakout strategy",
    type: "preset",
  },
  {
    id: "chaos_trader",
    name: "Chaos Trader",
    description: "Chaotic breakout strategy with dynamic risk",
    type: "preset",
  },
];

export default function StrategiesPage() {
  const [customStrategies, setCustomStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [favoritesFilter, setFavoritesFilter] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "custom" | "preset">("all");

  const fetchCustomStrategies = useCallback(async () => {
    try {
      setLoading(true);
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
      const response = await fetch(`${baseUrl}/api/strategies`, {
        cache: "no-store",
      });

      if (!response.ok) {
        console.error("Failed to fetch custom strategies:", response.statusText);
        return;
      }

      const strategies = (await response.json()) as Strategy[];
      setCustomStrategies(strategies);
    } catch (error) {
      console.error("Error fetching custom strategies:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCustomStrategies();
  }, [fetchCustomStrategies]);

  const handleToggleFavorite = useCallback(async (id: string, isCustom: boolean) => {
    if (!isCustom) return; // Only custom strategies can be favorited

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
      const response = await fetch(`${baseUrl}/api/strategies/${id}/favorite`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      const { favorite } = (await response.json()) as { favorite: boolean };
      setCustomStrategies((prev) =>
        prev.map((strategy) => (strategy.id === id ? { ...strategy, favorite } : strategy)),
      );
    } catch (err) {
      console.error("toggle favorite failed", err);
    }
  }, []);

  // Combine and filter strategies
  const allStrategies = [...customStrategies, ...PRESET_STRATEGIES];
  const filteredStrategies = allStrategies.filter((strategy) => {
    const matchesSearch =
      searchQuery === "" ||
      strategy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      strategy.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      strategy.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === "all" || strategy.type === typeFilter;

    const matchesFavorites = !favoritesFilter || strategy.favorite === true;

    return matchesSearch && matchesType && matchesFavorites;
  });

  const customFilteredStrategies = filteredStrategies.filter((s) => s.type === "custom");
  const presetFilteredStrategies = filteredStrategies.filter((s) => s.type === "preset");

  return (
    <div>
      <div
        style={{
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "2rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="section-title" style={{ marginBottom: "0.5rem" }}>
            STRATEGY LIBRARY
          </h1>
          <p
            style={{
              color: "var(--steel-300)",
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            BROWSE PRESET STRATEGIES OR BUILD YOUR OWN
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={() => setFavoritesFilter(!favoritesFilter)}
            className={favoritesFilter ? "btn-primary" : "btn-secondary"}
            style={{
              padding: "0.75rem 1.25rem",
            }}
          >
            {favoritesFilter ? "★ Favorites" : "☆ All"}
          </button>
          <Link href="/strategies/new" className="btn-primary">
            NEW STRATEGY
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          marginBottom: "2rem",
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "2fr 1fr",
        }}
      >
        <input
          type="text"
          placeholder="Search strategies by name, description, or tags..."
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
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | "custom" | "preset")}
          style={{
            padding: "0.6rem 1rem",
            background: "var(--graphite-300)",
            border: "1px solid var(--graphite-100)",
            color: "var(--steel-100)",
            fontSize: "0.9rem",
          }}
        >
          <option value="all">All Types</option>
          <option value="custom">Custom Only</option>
          <option value="preset">Preset Only</option>
        </select>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <div className="loading" style={{ fontSize: "1.5rem" }}>
            Loading strategies...
          </div>
        </div>
      ) : (
        <>
          {customFilteredStrategies.length > 0 && (
            <section style={{ marginBottom: "3rem" }}>
              <h2
                style={{
                  fontSize: "1.1rem",
                  marginBottom: "1.25rem",
                  color: "var(--ember-orange)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                CUSTOM STRATEGIES ({customFilteredStrategies.length})
              </h2>
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
              >
                {customFilteredStrategies.map((strategy) => (
                  <StrategyCard
                    key={strategy.id}
                    strategy={strategy}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}

          {presetFilteredStrategies.length > 0 && (
            <section>
              <h2
                style={{
                  fontSize: "1.1rem",
                  marginBottom: "1.25rem",
                  color: "var(--steel-200)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                PRESET STRATEGIES ({presetFilteredStrategies.length})
              </h2>
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
              >
                {presetFilteredStrategies.map((strategy) => (
                  <StrategyCard
                    key={strategy.id}
                    strategy={strategy}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}

          {filteredStrategies.length === 0 && (
            <div
              style={{
                marginTop: "3rem",
                padding: "3rem",
                border: "2px dashed var(--graphite-100)",
                background: "var(--graphite-400)",
                textAlign: "center",
              }}
            >
              <h3
                style={{
                  fontSize: "1rem",
                  color: "var(--steel-200)",
                  marginBottom: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                NO STRATEGIES FOUND
              </h3>
              <p style={{ color: "var(--steel-400)", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
                {favoritesFilter
                  ? "NO FAVORITE STRATEGIES YET"
                  : "TRY ADJUSTING YOUR SEARCH OR FILTERS"}
              </p>
              {!favoritesFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setTypeFilter("all");
                  }}
                  className="btn-secondary"
                >
                  CLEAR FILTERS
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StrategyCard({
  strategy,
  onToggleFavorite,
}: {
  strategy: Strategy;
  onToggleFavorite: (id: string, isCustom: boolean) => Promise<void>;
}) {
  const isCustom = strategy.type === "custom";

  return (
    <div className="card" style={{ padding: "1.5rem", position: "relative" }}>
      {/* Favorite Star (only for custom strategies) */}
      {isCustom && (
        <button
          type="button"
          onClick={() => void onToggleFavorite(strategy.id, isCustom)}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "transparent",
            border: "none",
            fontSize: "1.25rem",
            cursor: "pointer",
            padding: "0",
            lineHeight: "1",
            color: strategy.favorite ? "var(--ember-orange)" : "var(--steel-400)",
            transition: "color 0.2s ease",
          }}
          title={strategy.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          {strategy.favorite ? "★" : "☆"}
        </button>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1rem",
          paddingRight: isCustom ? "2rem" : "0",
        }}
      >
        <h3
          style={{
            fontSize: "0.95rem",
            fontWeight: 700,
            color: "var(--steel-100)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {strategy.name}
        </h3>
        <span
          style={{
            fontSize: "0.65rem",
            padding: "0.25rem 0.6rem",
            background: isCustom ? "var(--ember-orange)" : "var(--graphite-100)",
            color: isCustom ? "white" : "var(--steel-300)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {isCustom ? "CUSTOM" : "PRESET"}
        </span>
      </div>

      <p
        style={{
          color: "var(--steel-300)",
          fontSize: "0.8rem",
          marginBottom: "1rem",
          lineHeight: 1.5,
        }}
      >
        {strategy.description}
      </p>

      {strategy.tags && strategy.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {strategy.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: "0.65rem",
                background: "var(--graphite-200)",
                color: "var(--steel-400)",
                padding: "0.2rem 0.5rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {(strategy.version || strategy.author) && (
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--steel-400)",
            marginBottom: "1rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {strategy.version && <span>V{strategy.version}</span>}
          {strategy.version && strategy.author && <span> / </span>}
          {strategy.author && <span>{strategy.author}</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "auto" }}>
        {isCustom && (
          <Link
            href={`/strategies/${strategy.id}/edit`}
            className="btn-secondary"
            style={{ flex: 1, textAlign: "center", fontSize: "0.75rem", padding: "0.6rem 1rem" }}
          >
            EDIT
          </Link>
        )}
        <Link
          href={`/new-run?strategy=${strategy.id}`}
          className="btn-primary"
          style={{ flex: 1, textAlign: "center", fontSize: "0.75rem", padding: "0.6rem 1rem" }}
        >
          USE
        </Link>
      </div>
    </div>
  );
}
