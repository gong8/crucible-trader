import { strict as assert } from "node:assert";
import test from "node:test";
import {
  DataRequestSchema,
  BacktestRequestSchema,
  BacktestResultSchema,
  RiskProfileSchema,
  assertValid,
  type DataRequest,
  type BacktestRequest,
} from "../src/index.js";

// ============================================================================
// DataRequest validation tests
// ============================================================================

test("DataRequestSchema validates valid request", () => {
  const valid: DataRequest = {
    source: "csv",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-12-31",
    adjusted: true,
  };

  const result = DataRequestSchema.safeParse(valid);
  assert.ok(result.success);
});

test("DataRequestSchema rejects invalid source", () => {
  const invalid = {
    source: "invalid",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-12-31",
  };

  const result = DataRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("DataRequestSchema rejects empty symbol", () => {
  const invalid = {
    source: "csv",
    symbol: "",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-12-31",
  };

  const result = DataRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("DataRequestSchema rejects invalid timeframe", () => {
  const invalid = {
    source: "csv",
    symbol: "AAPL",
    timeframe: "5m",
    start: "2024-01-01",
    end: "2024-12-31",
  };

  const result = DataRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("DataRequestSchema accepts all valid sources", () => {
  const sources = ["auto", "csv", "tiingo", "polygon"];
  for (const source of sources) {
    const request = {
      source,
      symbol: "AAPL",
      timeframe: "1d",
      start: "2024-01-01",
      end: "2024-12-31",
    };
    const result = DataRequestSchema.safeParse(request);
    assert.ok(result.success, `source ${source} should be valid`);
  }
});

test("DataRequestSchema accepts all valid timeframes", () => {
  const timeframes = ["1d", "1h", "15m", "1m"];
  for (const timeframe of timeframes) {
    const request = {
      source: "csv",
      symbol: "AAPL",
      timeframe,
      start: "2024-01-01",
      end: "2024-12-31",
    };
    const result = DataRequestSchema.safeParse(request);
    assert.ok(result.success, `timeframe ${timeframe} should be valid`);
  }
});

test("DataRequestSchema makes adjusted optional", () => {
  const withoutAdjusted = {
    source: "csv",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-12-31",
  };

  const result = DataRequestSchema.safeParse(withoutAdjusted);
  assert.ok(result.success);
});

test("DataRequestSchema rejects non-boolean adjusted", () => {
  const invalid = {
    source: "csv",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-12-31",
    adjusted: "true",
  };

  const result = DataRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

// ============================================================================
// BacktestRequest validation tests
// ============================================================================

test("BacktestRequestSchema validates valid request", () => {
  const valid: BacktestRequest = {
    runName: "test-run",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-12-31",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: {
      feeBps: 1,
      slippageBps: 2,
    },
    initialCash: 100_000,
  };

  const result = BacktestRequestSchema.safeParse(valid);
  assert.ok(result.success);
});

test("BacktestRequestSchema rejects empty runName", () => {
  const invalid = {
    runName: "",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-12-31",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const result = BacktestRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("BacktestRequestSchema rejects empty data array", () => {
  const invalid = {
    runName: "test",
    data: [],
    strategy: {
      name: "sma_crossover",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const result = BacktestRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("BacktestRequestSchema rejects negative fees", () => {
  const invalid = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-12-31",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: {},
    },
    costs: { feeBps: -1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const result = BacktestRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("BacktestRequestSchema rejects non-positive initialCash", () => {
  const invalid = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-12-31",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 0,
  };

  const result = BacktestRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("BacktestRequestSchema accepts optional seed", () => {
  const valid = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-12-31",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
    seed: 42,
  };

  const result = BacktestRequestSchema.safeParse(valid);
  assert.ok(result.success);
});

test("BacktestRequestSchema rejects non-integer seed", () => {
  const invalid = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-12-31",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
    seed: 42.5,
  };

  const result = BacktestRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("BacktestRequestSchema accepts valid metrics array", () => {
  const valid = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-12-31",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
    metrics: ["sharpe", "sortino", "max_dd", "cagr"],
  };

  const result = BacktestRequestSchema.safeParse(valid);
  assert.ok(result.success);
});

test("BacktestRequestSchema rejects invalid metrics", () => {
  const invalid = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-12-31",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
    metrics: ["invalid_metric"],
  };

  const result = BacktestRequestSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

// ============================================================================
// BacktestResult validation tests
// ============================================================================

test("BacktestResultSchema validates valid result", () => {
  const valid = {
    runId: "test-run-123",
    summary: { sharpe: 1.5, max_dd: -0.1 },
    artifacts: {
      equityParquet: "storage/runs/test/equity.parquet",
      tradesParquet: "storage/runs/test/trades.parquet",
      barsParquet: "storage/runs/test/bars.parquet",
      reportMd: "storage/runs/test/report.md",
    },
    diagnostics: { version: "0.0.1" },
  };

  const result = BacktestResultSchema.safeParse(valid);
  assert.ok(result.success);
});

test("BacktestResultSchema rejects empty runId", () => {
  const invalid = {
    runId: "",
    summary: {},
    artifacts: {
      equityParquet: "equity.parquet",
      tradesParquet: "trades.parquet",
      barsParquet: "bars.parquet",
    },
    diagnostics: {},
  };

  const result = BacktestResultSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("BacktestResultSchema makes reportMd optional", () => {
  const valid = {
    runId: "test",
    summary: {},
    artifacts: {
      equityParquet: "equity.parquet",
      tradesParquet: "trades.parquet",
      barsParquet: "bars.parquet",
    },
    diagnostics: {},
  };

  const result = BacktestResultSchema.safeParse(valid);
  assert.ok(result.success);
});

// ============================================================================
// RiskProfile validation tests
// ============================================================================

test("RiskProfileSchema validates valid profile", () => {
  const valid = {
    id: "custom",
    name: "Custom Profile",
    maxDailyLossPct: 0.05,
    maxPositionPct: 0.2,
    perOrderCapPct: 0.1,
    globalDDKillPct: 0.08,
    cooldownMinutes: 30,
  };

  const result = RiskProfileSchema.safeParse(valid);
  assert.ok(result.success);
});

test("RiskProfileSchema rejects negative percentages", () => {
  const invalid = {
    id: "custom",
    name: "Custom Profile",
    maxDailyLossPct: -0.05,
    maxPositionPct: 0.2,
    perOrderCapPct: 0.1,
    globalDDKillPct: 0.08,
    cooldownMinutes: 30,
  };

  const result = RiskProfileSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("RiskProfileSchema rejects negative cooldown", () => {
  const invalid = {
    id: "custom",
    name: "Custom Profile",
    maxDailyLossPct: 0.05,
    maxPositionPct: 0.2,
    perOrderCapPct: 0.1,
    globalDDKillPct: 0.08,
    cooldownMinutes: -10,
  };

  const result = RiskProfileSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("RiskProfileSchema rejects non-integer cooldown", () => {
  const invalid = {
    id: "custom",
    name: "Custom Profile",
    maxDailyLossPct: 0.05,
    maxPositionPct: 0.2,
    perOrderCapPct: 0.1,
    globalDDKillPct: 0.08,
    cooldownMinutes: 10.5,
  };

  const result = RiskProfileSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

// ============================================================================
// assertValid tests
// ============================================================================

test("assertValid returns parsed data for valid input", () => {
  const input = {
    source: "csv",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-12-31",
  };

  const result = assertValid(DataRequestSchema, input, "test request");
  assert.deepEqual(result, input);
});

test("assertValid throws Error for invalid input", () => {
  const input = {
    source: "invalid",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-12-31",
  };

  assert.throws(() => assertValid(DataRequestSchema, input, "test request"), {
    message: /Invalid test request/,
  });
});

test("assertValid error message includes field path", () => {
  const input = {
    source: "csv",
    symbol: "",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-12-31",
  };

  assert.throws(() => assertValid(DataRequestSchema, input, "request"), {
    message: /symbol/,
  });
});

test("assertValid uses default label when not provided", () => {
  const input = { invalid: true };

  assert.throws(() => assertValid(DataRequestSchema, input), {
    message: /Invalid payload/,
  });
});
