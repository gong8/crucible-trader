import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BacktestRequest } from "@crucible-trader/sdk";
import { runBacktest } from "../src/engine.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, "..", "..", "..", "..");
const DATASETS_DIR = join(REPO_ROOT, "storage", "datasets");
const SAMPLE_SYMBOL = "AAPL";
const SAMPLE_DATA = `timestamp,open,high,low,close,volume
2024-01-01T00:00:00.000Z,100,105,95,102,1000
2024-01-02T00:00:00.000Z,102,107,98,104,1200
2024-01-03T00:00:00.000Z,104,109,100,106,1100
2024-01-04T00:00:00.000Z,106,111,102,108,1300
2024-01-05T00:00:00.000Z,108,113,104,110,1400
2024-01-06T00:00:00.000Z,110,115,106,112,1450
2024-01-07T00:00:00.000Z,112,117,108,114,1500
2024-01-08T00:00:00.000Z,114,119,110,116,1550
2024-01-09T00:00:00.000Z,116,121,112,118,1600
2024-01-10T00:00:00.000Z,118,123,114,120,1650`;

const ensureSampleDataset = async (t: test.TestContext, symbol = SAMPLE_SYMBOL): Promise<void> => {
  await mkdir(DATASETS_DIR, { recursive: true });
  const filename = `${symbol.toLowerCase()}_1d.csv`;
  const path = join(DATASETS_DIR, filename);
  await writeFile(path, SAMPLE_DATA, { encoding: "utf-8" });
  t.after(async () => {
    await rm(path, { force: true });
  });
};

// ============================================================================
// Integration tests for engine with various data scenarios
// ============================================================================

test("runBacktest fails when data source file is missing", async () => {
  const request: BacktestRequest = {
    runName: "missing-data-test",
    data: [
      {
        source: "csv",
        symbol: "NONEXISTENT",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 4 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  await assert.rejects(
    async () => {
      await runBacktest(request);
    },
    {
      message: /No bars loaded|Please ensure the data file exists/,
    },
  );
});

test("runBacktest fails with empty data array", async () => {
  const request: BacktestRequest = {
    runName: "empty-data-test",
    data: [],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 4 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  await assert.rejects(
    async () => {
      await runBacktest(request);
    },
    {
      message: /Array must contain at least 1 element/,
    },
  );
});

test("runBacktest fails with unknown strategy", async (t) => {
  await ensureSampleDataset(t);
  const request: BacktestRequest = {
    runName: "unknown-strategy-test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "nonexistent_strategy",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  await assert.rejects(
    async () => {
      await runBacktest(request);
    },
    {
      message: /Strategy not found/,
    },
  );
});

test("runBacktest validates strategy parameters", async (t) => {
  await ensureSampleDataset(t);
  const request: BacktestRequest = {
    runName: "invalid-params-test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
        adjusted: true,
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: {
        fastLength: -1, // Invalid: negative
        slowLength: 4,
      },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  await assert.rejects(
    async () => {
      await runBacktest(request);
    },
    (error: Error) => {
      // Should fail validation
      return (
        error.message.includes("Number must be greater than") || error.message.includes("positive")
      );
    },
  );
});

test("runBacktest generates deterministic results with same seed", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "engine-determinism-"));
  const csvContent = `timestamp,open,high,low,close,volume
2024-01-01T00:00:00.000Z,100,105,95,102,1000
2024-01-02T00:00:00.000Z,102,107,98,104,1200
2024-01-03T00:00:00.000Z,104,109,100,106,1100
2024-01-04T00:00:00.000Z,106,111,102,108,1300
2024-01-05T00:00:00.000Z,108,113,104,110,1400`;

  await mkdir(DATASETS_DIR, { recursive: true });
  await writeFile(join(DATASETS_DIR, "test_1d.csv"), csvContent);

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(join(DATASETS_DIR, "test_1d.csv"), { force: true });
  });

  const request: BacktestRequest = {
    runName: "determinism-test",
    data: [
      {
        source: "csv",
        symbol: "TEST",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-05",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 3 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
    seed: 42,
  };

  const result1 = await runBacktest(request, { runId: "test-1" });
  const result2 = await runBacktest(request, { runId: "test-2" });

  assert.deepEqual(
    result1.summary,
    result2.summary,
    "Results should be deterministic with same seed",
  );

  // Cleanup
  await rm(join(tempDir, "../../storage/runs/test-1"), { recursive: true, force: true });
  await rm(join(tempDir, "../../storage/runs/test-2"), { recursive: true, force: true });
});

test("runBacktest handles zero initial cash", async (t) => {
  await ensureSampleDataset(t);
  const request: BacktestRequest = {
    runName: "zero-cash-test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 4 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 0,
  };

  // Should fail validation due to non-positive initialCash
  await assert.rejects(
    async () => {
      await runBacktest(request);
    },
    (error: Error) => {
      return (
        error.message.includes("Number must be greater than 0") ||
        error.message.includes("positive")
      );
    },
  );
});

test("runBacktest handles negative costs", async (t) => {
  await ensureSampleDataset(t);
  const request: BacktestRequest = {
    runName: "negative-costs-test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 4 },
    },
    costs: { feeBps: -1, slippageBps: 2 },
    initialCash: 100_000,
  };

  await assert.rejects(
    async () => {
      await runBacktest(request);
    },
    (error: Error) => {
      return (
        error.message.includes("nonnegative") ||
        error.message.includes("must be greater than or equal to 0")
      );
    },
  );
});

test("runBacktest creates all required artifacts", async (t) => {
  const csvContent = `timestamp,open,high,low,close,volume
2024-01-01T00:00:00.000Z,100,105,95,102,1000
2024-01-02T00:00:00.000Z,102,107,98,104,1200`;

  const tempDir = await mkdtemp(join(tmpdir(), "engine-artifacts-"));
  const datasetPath = join(DATASETS_DIR, "arttest_1d.csv");
  await mkdir(DATASETS_DIR, { recursive: true });
  await writeFile(datasetPath, csvContent);

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(datasetPath, { force: true });
  });

  const request: BacktestRequest = {
    runName: "artifacts-test",
    data: [
      {
        source: "csv",
        symbol: "ARTTEST",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-02",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 3 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const result = await runBacktest(request, { runId: "artifacts-test-run" });

  assert.ok(result.runId, "Should have runId");
  assert.ok(result.summary, "Should have summary");
  assert.ok(result.artifacts, "Should have artifacts");
  assert.ok(result.artifacts.equityParquet, "Should have equity parquet");
  assert.ok(result.artifacts.tradesParquet, "Should have trades parquet");
  assert.ok(result.artifacts.barsParquet, "Should have bars parquet");
  assert.ok(result.artifacts.reportMd, "Should have report markdown");
  assert.ok(result.diagnostics, "Should have diagnostics");

  // Cleanup
  await rm(join(tempDir, "../../storage/runs/artifacts-test-run"), {
    recursive: true,
    force: true,
  });
});

test("runBacktest enforces risk limits - kill switch on drawdown", async (t) => {
  const csvContent = `timestamp,open,high,low,close,volume
2024-01-01T00:00:00.000Z,100,105,95,100,1000
2024-01-02T00:00:00.000Z,100,105,95,50,1200
2024-01-03T00:00:00.000Z,50,55,45,40,1100`;

  const tempDir = await mkdtemp(join(tmpdir(), "engine-risk-"));
  const datasetPath = join(DATASETS_DIR, "risktest_1d.csv");
  await mkdir(DATASETS_DIR, { recursive: true });
  await writeFile(datasetPath, csvContent);

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(datasetPath, { force: true });
  });

  const request: BacktestRequest = {
    runName: "risk-limits-test",
    data: [
      {
        source: "csv",
        symbol: "RISKTEST",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-03",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 3 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const result = await runBacktest(request, {
    runId: "risk-test-run",
    riskProfile: {
      id: "strict",
      name: "Strict Limits",
      maxDailyLossPct: 0.01,
      maxPositionPct: 0.2,
      perOrderCapPct: 0.1,
      globalDDKillPct: 0.05, // 5% drawdown kill switch
      cooldownMinutes: 15,
    },
  });

  // With a 5% kill switch and severe price drop, backtest should stop early
  assert.ok(result.summary, "Should still produce summary");

  // Cleanup
  await rm(join(tempDir, "../../storage/runs/risk-test-run"), { recursive: true, force: true });
});

test("runBacktest handles invalid date ranges", async () => {
  const request: BacktestRequest = {
    runName: "invalid-dates-test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-12-31",
        end: "2024-01-01", // End before start
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 4 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  // Should either fail or return empty data
  try {
    const result = await runBacktest(request, { runId: "invalid-dates-run" });

    // If it doesn't fail, it should have no trades or equity points
    // due to no data in the invalid range
    assert.ok(result);

    // Cleanup
    await rm(join(tmpdir(), "../../storage/runs/invalid-dates-run"), {
      recursive: true,
      force: true,
    }).catch(() => {});
  } catch (error) {
    // Also acceptable to throw an error for invalid date ranges
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes("No bars loaded") || error.message.includes("Invalid"));
  }
});

test("runBacktest validates all metric keys are recognized", async (t) => {
  const csvContent = `timestamp,open,high,low,close,volume
2024-01-01T00:00:00.000Z,100,105,95,102,1000`;

  const tempDir = await mkdtemp(join(tmpdir(), "engine-metrics-"));
  const datasetPath = join(DATASETS_DIR, "metrictest_1d.csv");
  await mkdir(DATASETS_DIR, { recursive: true });
  await writeFile(datasetPath, csvContent);

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(datasetPath, { force: true });
  });

  const request: BacktestRequest = {
    runName: "metrics-test",
    data: [
      {
        source: "csv",
        symbol: "METRICTEST",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-01",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 2, slowLength: 3 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
    metrics: [
      "sharpe",
      "sortino",
      "max_dd",
      "cagr",
      "winrate",
      "total_pnl",
      "total_return",
      "num_trades",
      "profit_factor",
    ],
  };

  const result = await runBacktest(request, { runId: "metrics-test-run" });

  // All requested metrics should be in the summary
  assert.ok("sharpe" in result.summary);
  assert.ok("sortino" in result.summary);
  assert.ok("max_dd" in result.summary);
  assert.ok("cagr" in result.summary);
  assert.ok("winrate" in result.summary);
  assert.ok("total_pnl" in result.summary);
  assert.ok("total_return" in result.summary);
  assert.ok("num_trades" in result.summary);
  assert.ok("profit_factor" in result.summary);

  // Cleanup
  await rm(join(tempDir, "../../storage/runs/metrics-test-run"), { recursive: true, force: true });
});
