import { strict as assert } from "node:assert";
import test from "node:test";

import type { DataRequest } from "@crucible-trader/sdk";

import { clampDataRequestRange } from "../src/routes/dataset-ensurer.js";

const mockDateNow = (isoDate: string): (() => void) => {
  const previous = Date.now;
  const epoch = Date.parse(isoDate);
  Date.now = () => epoch;
  return () => {
    Date.now = previous;
  };
};

test("clampDataRequestRange truncates future end dates", () => {
  const restore = mockDateNow("2025-01-15T00:00:00.000Z");
  try {
    const request: DataRequest = {
      source: "tiingo",
      symbol: "AAPL",
      timeframe: "1d",
      start: "2024-12-25",
      end: "2025-12-25",
      adjusted: true,
    };
    const result = clampDataRequestRange(request);

    assert.equal(result.start, "2024-12-25");
    assert.equal(result.end, "2025-01-15");
  } finally {
    restore();
  }
});

test("clampDataRequestRange snaps start to clamped end when entire range is future", () => {
  const restore = mockDateNow("2025-01-15T00:00:00.000Z");
  try {
    const request: DataRequest = {
      source: "polygon",
      symbol: "AAPL",
      timeframe: "1d",
      start: "2025-02-01",
      end: "2025-03-01",
    };
    const result = clampDataRequestRange(request);

    assert.equal(result.start, "2025-01-15");
    assert.equal(result.end, "2025-01-15");
  } finally {
    restore();
  }
});

test("clampDataRequestRange returns original reference when range already valid", () => {
  const restore = mockDateNow("2025-01-15T00:00:00.000Z");
  try {
    const request: DataRequest = {
      source: "tiingo",
      symbol: "AAPL",
      timeframe: "1d",
      start: "2024-01-01",
      end: "2024-12-31",
    };
    const result = clampDataRequestRange(request);

    assert.strictEqual(result, request);
  } finally {
    restore();
  }
});
