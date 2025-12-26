import { strict as assert } from "node:assert";
import test from "node:test";

import { strategyConfigs } from "@crucible-trader/sdk";

import type { BuildArgs, DatasetRecord } from "../src/app/new-run/helpers.ts";
import {
  buildDatasetOverride,
  buildRequestSafely,
  generateRunName,
} from "../src/app/new-run/helpers.ts";

const sampleStrategy = strategyConfigs.sma_crossover;

const buildArgs = (overrides?: Partial<BuildArgs>): BuildArgs => ({
  runName: "demo_run",
  dataSource: "csv",
  symbol: "AAPL",
  timeframe: "1d",
  start: "2023-01-01",
  end: "2023-12-31",
  adjusted: true,
  strategyName: sampleStrategy.key,
  strategyConfig: sampleStrategy,
  strategyValues: { ...sampleStrategy.defaults },
  feeBps: "1",
  slippageBps: "2",
  initialCash: "100000",
  seed: "42",
  riskProfileId: "default",
  selectedMetrics: ["sharpe", "max_dd"],
  datasetOverride: undefined,
  ...overrides,
});

const dataset = (overrides?: Partial<DatasetRecord>): DatasetRecord => ({
  id: 1,
  source: "csv",
  symbol: "AAPL",
  timeframe: "1d",
  start: "2022-01-01",
  end: "2023-01-01",
  adjusted: true,
  path: "/tmp/dataset.parquet",
  rows: 1000,
  createdAt: "2023-01-02T00:00:00Z",
  ...overrides,
});

test("generateRunName slugs strings and lowercases", () => {
  const runName = generateRunName("SMA Strategy", "MSFT/USD", "1H");
  assert.equal(runName, "sma_strategy_msft_usd_1h");
});

test("buildDatasetOverride returns undefined when flag or dataset missing", () => {
  assert.equal(buildDatasetOverride(false, dataset()), undefined);
  assert.equal(buildDatasetOverride(true, null), undefined);
});

test("buildDatasetOverride maps dataset fields when provided", () => {
  const override = buildDatasetOverride(true, dataset({ adjusted: false }));
  assert.ok(Array.isArray(override));
  assert.equal(override?.[0]?.symbol, "AAPL");
  assert.equal(override?.[0]?.timeframe, "1d");
  assert.equal(override?.[0]?.start, "2022-01-01");
  assert.equal(override?.[0]?.end, "2023-01-01");
  assert.equal(override?.[0]?.adjusted, false);
});

test("buildDatasetOverride falls back to current date when dataset is missing range", () => {
  const RealDate = Date;
  class MockDate extends Date {
    public constructor() {
      super("2024-04-05T00:00:00Z");
    }
    public static override now(): number {
      return new RealDate("2024-04-05T00:00:00Z").valueOf();
    }
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error override for test determinism
  globalThis.Date = MockDate;
  try {
    const override = buildDatasetOverride(true, dataset({ start: null, end: null }));
    assert.equal(override?.[0]?.start, "2024-04-05");
    assert.equal(override?.[0]?.end, "2024-04-05");
  } finally {
    globalThis.Date = RealDate;
  }
});

test("buildRequestSafely returns a fully typed BacktestRequest", () => {
  const { request, error } = buildRequestSafely(buildArgs());
  assert.ok(request);
  assert.equal(error, null);
  assert.equal(request?.costs.feeBps, 1);
  assert.equal(request?.costs.slippageBps, 2);
  assert.equal(request?.initialCash, 100000);
  assert.equal(request?.seed, 42);
  assert.deepEqual(request?.metrics, ["sharpe", "max_dd"]);
});

test("buildRequestSafely omits metrics when list is empty", () => {
  const { request } = buildRequestSafely(
    buildArgs({
      selectedMetrics: [],
    }),
  );
  assert.equal(request?.metrics, undefined);
});

test("buildRequestSafely surfaces strategy validation errors", () => {
  const { request, error } = buildRequestSafely(
    buildArgs({
      strategyValues: { fastLength: 0, slowLength: 1 },
    }),
  );
  assert.equal(request, null);
  assert.ok(error?.includes("strategy params error"));
});

test("buildRequestSafely handles optional seed and numeric coercion", () => {
  const { request } = buildRequestSafely(
    buildArgs({
      seed: "",
      feeBps: "0",
      slippageBps: "10",
      initialCash: "50000",
    }),
  );
  assert.equal(request?.seed, undefined);
  assert.equal(request?.costs.feeBps, 0);
  assert.equal(request?.costs.slippageBps, 10);
  assert.equal(request?.initialCash, 50000);
});
