import Link from "next/link";

interface Strategy {
  id: string;
  name: string;
  description: string;
  type: "preset" | "custom";
  version?: string;
  author?: string;
  tags?: string[];
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

async function getCustomStrategies(): Promise<Strategy[]> {
  try {
    // Server-side fetch needs full URL (port 3001 for dev, or use env var)
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
    const response = await fetch(`${baseUrl}/api/strategies`, {
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Failed to fetch custom strategies:", response.statusText);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching custom strategies:", error);
    return [];
  }
}

export default async function StrategiesPage() {
  const customStrategies = await getCustomStrategies();

  return (
    <div>
      <div
        style={{
          marginBottom: "2.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
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
        <Link href="/strategies/new" className="btn-primary">
          NEW STRATEGY
        </Link>
      </div>

      {customStrategies.length > 0 && (
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
            CUSTOM STRATEGIES
          </h2>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
          >
            {customStrategies.map((strategy) => (
              <StrategyCard key={strategy.id} strategy={strategy} />
            ))}
          </div>
        </section>
      )}

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
          PRESET STRATEGIES
        </h2>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {PRESET_STRATEGIES.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>
      </section>

      {customStrategies.length === 0 && (
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
            NO CUSTOM STRATEGIES YET
          </h3>
          <p style={{ color: "var(--steel-400)", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
            CREATE YOUR FIRST CUSTOM TRADING STRATEGY
          </p>
          <Link href="/strategies/new" className="btn-primary">
            CREATE STRATEGY
          </Link>
        </div>
      )}
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: Strategy }) {
  const isCustom = strategy.type === "custom";

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1rem",
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
