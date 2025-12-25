import { strict as assert } from "node:assert";
import test from "node:test";
import type { Bar } from "../src/IDataSource.js";
import type { DataRequest } from "@crucible-trader/sdk";
import {
  slugify,
  sanitizeBar,
  filterBarsForRequest,
  sortBarsChronologically,
} from "../src/internalUtils.js";

// ============================================================================
// slugify tests
// ============================================================================

test("slugify converts uppercase to lowercase", () => {
  assert.equal(slugify("AAPL"), "aapl");
  assert.equal(slugify("TEST"), "test");
});

test("slugify replaces spaces with underscores", () => {
  assert.equal(slugify("hello world"), "hello_world");
  assert.equal(slugify("foo bar baz"), "foo_bar_baz");
});

test("slugify replaces special characters with underscores", () => {
  assert.equal(slugify("foo-bar"), "foo_bar");
  assert.equal(slugify("foo.bar"), "foo_bar");
  assert.equal(slugify("foo@bar#baz"), "foo_bar_baz");
});

test("slugify removes leading and trailing underscores", () => {
  assert.equal(slugify("_foo_"), "foo");
  assert.equal(slugify("___bar___"), "bar");
});

test("slugify collapses consecutive special characters", () => {
  assert.equal(slugify("foo---bar"), "foo_bar");
  assert.equal(slugify("foo...bar"), "foo_bar");
});

test("slugify handles empty string", () => {
  assert.equal(slugify(""), "");
});

test("slugify handles numeric strings", () => {
  assert.equal(slugify("123"), "123");
  assert.equal(slugify("42.5"), "42_5");
});

test("slugify handles mixed alphanumeric", () => {
  assert.equal(slugify("AAPL-2024"), "aapl_2024");
  assert.equal(slugify("test_123_foo"), "test_123_foo");
});

test("slugify handles unicode characters", () => {
  assert.equal(slugify("café"), "caf");
  assert.equal(slugify("naïve"), "na_ve");
});

// ============================================================================
// sanitizeBar tests
// ============================================================================

test("sanitizeBar returns valid bar unchanged", () => {
  const bar: Bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
  };

  const result = sanitizeBar(bar);
  assert.deepEqual(result, bar);
});

test("sanitizeBar returns null for null input", () => {
  assert.equal(sanitizeBar(null), null);
});

test("sanitizeBar returns null for undefined input", () => {
  assert.equal(sanitizeBar(undefined), null);
});

test("sanitizeBar returns null when timestamp is missing", () => {
  const bar = {
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
  } as unknown as Bar;

  assert.equal(sanitizeBar(bar), null);
});

test("sanitizeBar returns null when timestamp is not a string", () => {
  const bar = {
    timestamp: 123,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
  } as unknown as Bar;

  assert.equal(sanitizeBar(bar), null);
});

test("sanitizeBar returns null when open is missing", () => {
  const bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
  } as unknown as Bar;

  assert.equal(sanitizeBar(bar), null);
});

test("sanitizeBar returns null when open is not a number", () => {
  const bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: "100",
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
  } as unknown as Bar;

  assert.equal(sanitizeBar(bar), null);
});

test("sanitizeBar returns null when high is missing", () => {
  const bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: 100,
    low: 95,
    close: 102,
    volume: 1000,
  } as unknown as Bar;

  assert.equal(sanitizeBar(bar), null);
});

test("sanitizeBar returns null when low is missing", () => {
  const bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: 100,
    high: 105,
    close: 102,
    volume: 1000,
  } as unknown as Bar;

  assert.equal(sanitizeBar(bar), null);
});

test("sanitizeBar returns null when close is missing", () => {
  const bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: 100,
    high: 105,
    low: 95,
    volume: 1000,
  } as unknown as Bar;

  assert.equal(sanitizeBar(bar), null);
});

test("sanitizeBar returns null when volume is missing", () => {
  const bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: 100,
    high: 105,
    low: 95,
    close: 102,
  } as unknown as Bar;

  assert.equal(sanitizeBar(bar), null);
});

test("sanitizeBar accepts bar with zero volume", () => {
  const bar: Bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 0,
  };

  const result = sanitizeBar(bar);
  assert.deepEqual(result, bar);
});

test("sanitizeBar accepts bar with negative prices (edge case)", () => {
  const bar: Bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: -100,
    high: -95,
    low: -105,
    close: -102,
    volume: 1000,
  };

  const result = sanitizeBar(bar);
  assert.deepEqual(result, bar);
});

test("sanitizeBar filters out extra properties", () => {
  const bar = {
    timestamp: "2024-01-01T00:00:00.000Z",
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
    extraProperty: "should be filtered",
  } as Bar;

  const result = sanitizeBar(bar);
  assert.ok(result);
  assert.equal(Object.keys(result).length, 6);
  assert.equal((result as unknown as { extraProperty?: string }).extraProperty, undefined);
});

// ============================================================================
// filterBarsForRequest tests
// ============================================================================

const createBar = (timestamp: string, close: number): Bar => ({
  timestamp,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1000,
});

test("filterBarsForRequest includes bars within range", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
    createBar("2024-01-03T00:00:00.000Z", 102),
  ];

  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-03T00:00:00.000Z",
  };

  const result = filterBarsForRequest(bars, request);
  assert.equal(result.length, 3);
});

test("filterBarsForRequest excludes bars before start", () => {
  const bars: Bar[] = [
    createBar("2023-12-31T00:00:00.000Z", 99),
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
  ];

  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-02T00:00:00.000Z",
  };

  const result = filterBarsForRequest(bars, request);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.timestamp, "2024-01-01T00:00:00.000Z");
});

test("filterBarsForRequest excludes bars after end", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
    createBar("2024-01-03T00:00:00.000Z", 102),
  ];

  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-02T00:00:00.000Z",
  };

  const result = filterBarsForRequest(bars, request);
  assert.equal(result.length, 2);
  assert.equal(result[1]?.timestamp, "2024-01-02T00:00:00.000Z");
});

test("filterBarsForRequest includes bars at exact boundaries", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
    createBar("2024-01-03T00:00:00.000Z", 102),
  ];

  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "2024-01-02T00:00:00.000Z",
    end: "2024-01-02T00:00:00.000Z",
  };

  const result = filterBarsForRequest(bars, request);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.timestamp, "2024-01-02T00:00:00.000Z");
});

test("filterBarsForRequest returns empty array when no bars match", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
  ];

  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "2024-01-05T00:00:00.000Z",
    end: "2024-01-06T00:00:00.000Z",
  };

  const result = filterBarsForRequest(bars, request);
  assert.equal(result.length, 0);
});

test("filterBarsForRequest excludes bars with invalid timestamps", () => {
  const bars: Bar[] = [
    createBar("invalid-timestamp", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
  ];

  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-03T00:00:00.000Z",
  };

  const result = filterBarsForRequest(bars, request);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.timestamp, "2024-01-02T00:00:00.000Z");
});

test("filterBarsForRequest handles empty bar array", () => {
  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-02T00:00:00.000Z",
  };

  const result = filterBarsForRequest([], request);
  assert.equal(result.length, 0);
});

test("filterBarsForRequest handles missing start date", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
  ];

  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "",
    end: "2024-01-02T00:00:00.000Z",
  };

  const result = filterBarsForRequest(bars, request);
  assert.equal(result.length, 2);
});

test("filterBarsForRequest handles missing end date", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
  ];

  const request: DataRequest = {
    source: "csv",
    symbol: "TEST",
    timeframe: "1d",
    start: "2024-01-01T00:00:00.000Z",
    end: "",
  };

  const result = filterBarsForRequest(bars, request);
  assert.equal(result.length, 2);
});

// ============================================================================
// sortBarsChronologically tests
// ============================================================================

test("sortBarsChronologically sorts bars in ascending order", () => {
  const bars: Bar[] = [
    createBar("2024-01-03T00:00:00.000Z", 102),
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
  ];

  const result = sortBarsChronologically(bars);
  assert.equal(result.length, 3);
  assert.equal(result[0]?.timestamp, "2024-01-01T00:00:00.000Z");
  assert.equal(result[1]?.timestamp, "2024-01-02T00:00:00.000Z");
  assert.equal(result[2]?.timestamp, "2024-01-03T00:00:00.000Z");
});

test("sortBarsChronologically handles already sorted bars", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
    createBar("2024-01-03T00:00:00.000Z", 102),
  ];

  const result = sortBarsChronologically(bars);
  assert.equal(result.length, 3);
  assert.deepEqual(result, bars);
});

test("sortBarsChronologically handles empty array", () => {
  const result = sortBarsChronologically([]);
  assert.equal(result.length, 0);
});

test("sortBarsChronologically handles single bar", () => {
  const bars: Bar[] = [createBar("2024-01-01T00:00:00.000Z", 100)];

  const result = sortBarsChronologically(bars);
  assert.equal(result.length, 1);
  assert.deepEqual(result, bars);
});

test("sortBarsChronologically handles bars with same timestamp", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-01T00:00:00.000Z", 101),
    createBar("2024-01-02T00:00:00.000Z", 102),
  ];

  const result = sortBarsChronologically(bars);
  assert.equal(result.length, 3);
  assert.equal(result[0]?.timestamp, "2024-01-01T00:00:00.000Z");
  assert.equal(result[1]?.timestamp, "2024-01-01T00:00:00.000Z");
  assert.equal(result[2]?.timestamp, "2024-01-02T00:00:00.000Z");
});

test("sortBarsChronologically returns a new array", () => {
  const bars: Bar[] = [
    createBar("2024-01-02T00:00:00.000Z", 101),
    createBar("2024-01-01T00:00:00.000Z", 100),
  ];

  const result = sortBarsChronologically(bars);
  assert.notEqual(result, bars);
});

test("sortBarsChronologically does not mutate original array", () => {
  const bars: Bar[] = [
    createBar("2024-01-03T00:00:00.000Z", 102),
    createBar("2024-01-01T00:00:00.000Z", 100),
    createBar("2024-01-02T00:00:00.000Z", 101),
  ];

  const original = [...bars];
  sortBarsChronologically(bars);
  assert.deepEqual(bars, original);
});

test("sortBarsChronologically handles bars with invalid timestamps", () => {
  const bars: Bar[] = [
    createBar("invalid-timestamp", 100),
    createBar("2024-01-01T00:00:00.000Z", 101),
  ];

  const result = sortBarsChronologically(bars);
  assert.equal(result.length, 2);
  // Invalid timestamp should be treated as 0 and sorted first
  assert.equal(result[0]?.timestamp, "invalid-timestamp");
  assert.equal(result[1]?.timestamp, "2024-01-01T00:00:00.000Z");
});

test("sortBarsChronologically handles intraday timestamps correctly", () => {
  const bars: Bar[] = [
    createBar("2024-01-01T15:30:00.000Z", 103),
    createBar("2024-01-01T09:30:00.000Z", 100),
    createBar("2024-01-01T12:00:00.000Z", 102),
    createBar("2024-01-01T10:00:00.000Z", 101),
  ];

  const result = sortBarsChronologically(bars);
  assert.equal(result[0]?.timestamp, "2024-01-01T09:30:00.000Z");
  assert.equal(result[1]?.timestamp, "2024-01-01T10:00:00.000Z");
  assert.equal(result[2]?.timestamp, "2024-01-01T12:00:00.000Z");
  assert.equal(result[3]?.timestamp, "2024-01-01T15:30:00.000Z");
});
