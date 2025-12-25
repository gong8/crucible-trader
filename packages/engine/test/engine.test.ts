import assert from "node:assert/strict";
import test from "node:test";

import type { BacktestRequest } from "@crucible-trader/sdk";

import { runBacktest } from "../src/engine.js";

const buildBars = (): Array<{
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> => {
  const values = [100, 101, 102, 103, 104, 103, 102, 105, 107, 106];
  return values.map((price, index) => {
    const iso = new Date(Date.UTC(2024, 0, index + 1)).toISOString();
    return {
      timestamp: iso,
      open: price,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 1_000 + index,
    };
  });
};

test("runBacktest executes SMA crossover strategy successfully", async () => {
  const request: BacktestRequest = {
    runName: "sma_aapl_trial",
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
        fastLength: 2,
        slowLength: 4,
        __bars: {
          AAPL: buildBars(),
        },
      },
    },
    costs: {
      feeBps: 1,
      slippageBps: 2,
    },
    initialCash: 100_000,
    seed: 42,
    metrics: ["sharpe", "sortino", "max_dd", "cagr", "winrate"],
  };

  const result = await runBacktest(request, { runId: "sma-aapl-trial-test" });
  assert.equal(result.runId, "sma-aapl-trial-test");
  assert.ok(typeof result.summary.sharpe === "number", "sharpe should be computed");
  assert.ok(typeof result.summary.max_dd === "number", "max drawdown should be computed");
  assert.ok(result.summary.max_dd <= 0, "max drawdown should be negative or zero");
  assert.ok(result.artifacts.reportMd?.endsWith("/report.md"), "report path should be emitted");
  assert.ok(
    result.artifacts.tradesParquet.includes("storage/runs"),
    "artifacts should be relative",
  );
  assert.ok(result.artifacts.barsParquet.includes("storage/runs"), "bars parquet path emitted");
});
