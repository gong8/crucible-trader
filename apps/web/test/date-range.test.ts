import { strict as assert } from "node:assert";
import test from "node:test";

import type { DataSource, Timeframe } from "@crucible-trader/sdk";
import type { DatasetRecord } from "../src/app/new-run/helpers";
import { computeAvailableRange } from "../src/app/new-run/date-range.ts";

const record = (overrides?: Partial<DatasetRecord>): DatasetRecord => ({
  id: Math.floor(Math.random() * 1000),
  source: "tiingo",
  symbol: "AAPL",
  timeframe: "1d",
  start: "2022-01-01T00:00:00.000Z",
  end: "2022-12-31T00:00:00.000Z",
  adjusted: true,
  path: "/tmp/aapl.csv",
  rows: 100,
  createdAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const range = (
  datasets: DatasetRecord[],
  source: DataSource,
  symbol = "AAPL",
  timeframe: Timeframe = "1d",
) =>
  computeAvailableRange({
    datasets,
    symbol,
    timeframe,
    source,
  });

test("computeAvailableRange picks tiingo range when available", () => {
  const result = range([record()], "tiingo");
  assert.ok(result);
  assert.equal(result?.start, "2022-01-01");
  assert.equal(result?.end, "2022-12-31");
  assert.equal(result?.source, "tiingo");
});

test("computeAvailableRange aggregates auto range from remote sources", () => {
  const datasets = [
    record({
      source: "tiingo",
      start: "2020-01-01T00:00:00.000Z",
      end: "2023-01-01T00:00:00.000Z",
    }),
    record({
      source: "polygon",
      start: "2019-06-01T00:00:00.000Z",
      end: "2024-03-01T00:00:00.000Z",
    }),
  ];
  const result = range(datasets, "auto");
  assert.ok(result);
  assert.equal(result?.start, "2019-06-01");
  assert.equal(result?.end, "2024-03-01");
  assert.equal(result?.source, "auto");
  assert.deepEqual(new Set(result?.contributingSources), new Set(["tiingo", "polygon"]));
});

test("computeAvailableRange falls back to csv coverage when remote missing", () => {
  const datasets = [
    record({ source: "csv", start: "2023-01-01T00:00:00.000Z", end: "2023-06-01T00:00:00.000Z" }),
  ];
  const result = range(datasets, "auto");
  assert.ok(result);
  assert.equal(result?.start, "2023-01-01");
  assert.equal(result?.end, "2023-06-01");
});

test("computeAvailableRange returns null when no dataset exists", () => {
  const result = range([], "tiingo");
  assert.equal(result, null);
});
