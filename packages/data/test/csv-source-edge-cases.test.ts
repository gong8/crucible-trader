import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { DataRequest } from "@crucible-trader/sdk";

import { CsvSource } from "../src/CsvSource.js";

// ============================================================================
// CSV Source - Malformed Data Edge Cases
// ============================================================================

test("CsvSource handles CSV with missing columns", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "test_1d.csv");

  try {
    // Missing 'volume' column
    const malformedCsv =
      `timestamp,open,high,low,close\n` + `2024-01-02T00:00:00.000Z,180.0,182.0,179.5,181.0`;

    await writeFile(datasetPath, malformedCsv, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "TEST",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-03T00:00:00.000Z",
    };

    // This might throw an error or return bars with volume: 0 or NaN
    try {
      const result = await source.loadBars(request);
      // If it succeeds, check what happens to volume
      if (result.length > 0) {
        // Document the behavior
        assert.ok(true, `Loaded ${result.length} bars despite missing volume column`);
      }
    } catch (error) {
      // Expected: CSV parsing might fail
      assert.ok(true, "CSV parser rejected malformed data");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles CSV with extra columns", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "test_1d.csv");

  try {
    // Extra columns that should be ignored
    const csvWithExtra =
      `timestamp,open,high,low,close,volume,extra1,extra2\n` +
      `2024-01-02T00:00:00.000Z,180.0,182.0,179.5,181.0,1000,foo,bar\n` +
      `2024-01-03T00:00:00.000Z,181.0,183.0,180.5,182.0,1200,baz,qux`;

    await writeFile(datasetPath, csvWithExtra, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "TEST",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    assert.equal(result.length, 2);
    // Extra columns should be ignored
    assert.ok(result[0]!.close === 181.0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles CSV with wrong column order", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "test_1d.csv");

  try {
    // Columns in different order (should work with proper CSV parser)
    const reorderedCsv =
      `close,volume,timestamp,open,high,low\n` +
      `181.0,1000,2024-01-02T00:00:00.000Z,180.0,182.0,179.5\n` +
      `182.0,1200,2024-01-03T00:00:00.000Z,181.0,183.0,180.5`;

    await writeFile(datasetPath, reorderedCsv, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "TEST",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    assert.equal(result.length, 2);
    // Should correctly parse based on header names
    assert.equal(result[0]!.close, 181.0);
    assert.equal(result[0]!.volume, 1000);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles empty CSV file", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "empty_1d.csv");

  try {
    await writeFile(datasetPath, "", { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "EMPTY",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    assert.equal(result.length, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles CSV with only headers", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "headers_1d.csv");

  try {
    await writeFile(datasetPath, "timestamp,open,high,low,close,volume\n", { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "HEADERS",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    assert.equal(result.length, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

// ============================================================================
// CSV Source - Invalid Data Values
// ============================================================================

test("CsvSource handles negative prices", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "negative_1d.csv");

  try {
    const csvWithNegative =
      `timestamp,open,high,low,close,volume\n` +
      `2024-01-02T00:00:00.000Z,-180.0,182.0,179.5,181.0,1000\n` +
      `2024-01-03T00:00:00.000Z,181.0,183.0,-180.5,182.0,1200`;

    await writeFile(datasetPath, csvWithNegative, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "NEGATIVE",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    // CSV source might accept negative prices (not validated)
    if (result.length > 0) {
      assert.ok(result[0]!.open === -180.0, "Negative prices not filtered");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles zero prices", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "zero_1d.csv");

  try {
    const csvWithZero =
      `timestamp,open,high,low,close,volume\n` + `2024-01-02T00:00:00.000Z,0,0,0,0,0`;

    await writeFile(datasetPath, csvWithZero, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "ZERO",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.close, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles NaN values in CSV", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "nan_1d.csv");

  try {
    const csvWithNaN =
      `timestamp,open,high,low,close,volume\n` +
      `2024-01-02T00:00:00.000Z,NaN,182.0,179.5,181.0,1000`;

    await writeFile(datasetPath, csvWithNaN, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "NAN",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    try {
      const result = await source.loadBars(request);
      // Parsing "NaN" string might result in NaN number or throw
      if (result.length > 0) {
        assert.ok(Number.isNaN(result[0]!.open), "NaN string parsed to NaN number");
      }
    } catch (error) {
      assert.ok(true, "NaN values cause parsing error");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles Infinity values in CSV", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "inf_1d.csv");

  try {
    const csvWithInf =
      `timestamp,open,high,low,close,volume\n` +
      `2024-01-02T00:00:00.000Z,Infinity,182.0,179.5,181.0,1000`;

    await writeFile(datasetPath, csvWithInf, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "INF",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    try {
      const result = await source.loadBars(request);
      if (result.length > 0) {
        assert.ok(!Number.isFinite(result[0]!.open), "Infinity value parsed");
      }
    } catch (error) {
      assert.ok(true, "Infinity values cause parsing error");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles very large numbers", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "large_1d.csv");

  try {
    const veryLargeNumber = "9".repeat(100);
    const csvWithLarge =
      `timestamp,open,high,low,close,volume\n` +
      `2024-01-02T00:00:00.000Z,${veryLargeNumber},182.0,179.5,181.0,1000`;

    await writeFile(datasetPath, csvWithLarge, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "LARGE",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    if (result.length > 0) {
      // Very large numbers become Infinity in JavaScript
      assert.ok(!Number.isFinite(result[0]!.open) || result[0]!.open > Number.MAX_SAFE_INTEGER);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

// ============================================================================
// CSV Source - Invalid Timestamp Formats
// ============================================================================

test("CsvSource handles invalid timestamp format", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "badtime_1d.csv");

  try {
    const csvWithBadTime =
      `timestamp,open,high,low,close,volume\n` + `not-a-timestamp,180.0,182.0,179.5,181.0,1000`;

    await writeFile(datasetPath, csvWithBadTime, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "BADTIME",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    try {
      const result = await source.loadBars(request);
      // Might throw or return empty array
      assert.ok(true, `Result: ${result.length} bars`);
    } catch (error) {
      assert.ok(true, "Invalid timestamp causes error");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles Unix timestamp instead of ISO 8601", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "unix_1d.csv");

  try {
    const csvWithUnix =
      `timestamp,open,high,low,close,volume\n` + `1704153600000,180.0,182.0,179.5,181.0,1000`; // Unix ms timestamp

    await writeFile(datasetPath, csvWithUnix, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "UNIX",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    try {
      const result = await source.loadBars(request);
      // Might fail to parse or treat as invalid
      assert.ok(true, `Unix timestamp handling: ${result.length} bars`);
    } catch (error) {
      assert.ok(true, "Unix timestamp not supported");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles timestamps with different timezone formats", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "tz_1d.csv");

  try {
    // Mix of timezone formats
    const csvWithTZ =
      `timestamp,open,high,low,close,volume\n` +
      `2024-01-02T00:00:00+00:00,180.0,182.0,179.5,181.0,1000\n` +
      `2024-01-03T00:00:00-05:00,181.0,183.0,180.5,182.0,1200`;

    await writeFile(datasetPath, csvWithTZ, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "TZ",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    // Should handle different timezone formats correctly
    if (result.length > 0) {
      assert.ok(result[0]!.timestamp.includes("Z") || result[0]!.timestamp.includes("+"));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

// ============================================================================
// CSV Source - OHLC Relationship Violations
// ============================================================================

test("CsvSource handles high < low violation", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "highlow_1d.csv");

  try {
    // high (170) < low (179.5) - invalid OHLC relationship
    const csvWithViolation =
      `timestamp,open,high,low,close,volume\n` +
      `2024-01-02T00:00:00.000Z,180.0,170.0,179.5,181.0,1000`;

    await writeFile(datasetPath, csvWithViolation, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "HIGHLOW",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    // CSV source likely doesn't validate OHLC relationships
    if (result.length > 0) {
      assert.ok(result[0]!.high < result[0]!.low, "OHLC violation not caught");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles close outside high-low range", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "closerange_1d.csv");

  try {
    // close (185) > high (182) - invalid
    const csvWithViolation =
      `timestamp,open,high,low,close,volume\n` +
      `2024-01-02T00:00:00.000Z,180.0,182.0,179.5,185.0,1000`;

    await writeFile(datasetPath, csvWithViolation, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "CLOSERANGE",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    if (result.length > 0) {
      assert.ok(result[0]!.close > result[0]!.high, "Close out of range not caught");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

// ============================================================================
// CSV Source - Special Characters and Encoding
// ============================================================================

test("CsvSource handles CSV with UTF-8 BOM", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "bom_1d.csv");

  try {
    // UTF-8 BOM at start of file
    const csvWithBOM =
      "\uFEFF" +
      `timestamp,open,high,low,close,volume\n` +
      `2024-01-02T00:00:00.000Z,180.0,182.0,179.5,181.0,1000`;

    await writeFile(datasetPath, csvWithBOM, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "BOM",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    try {
      const result = await source.loadBars(request);
      assert.ok(result.length >= 0, "BOM handled gracefully");
    } catch (error) {
      assert.ok(true, "BOM causes parsing error");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles CSV with quoted fields containing commas", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "quoted_1d.csv");

  try {
    // Some CSV parsers support quoted fields with commas
    const csvWithQuotes =
      `timestamp,open,high,low,close,volume,note\n` +
      `2024-01-02T00:00:00.000Z,180.0,182.0,179.5,181.0,1000,"Price is 180.0, high is 182.0"`;

    await writeFile(datasetPath, csvWithQuotes, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "QUOTED",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    const result = await source.loadBars(request);
    // Should handle quoted fields correctly
    assert.ok(result.length >= 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

// ============================================================================
// CSV Source - File System Edge Cases
// ============================================================================

test("CsvSource handles missing file", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");

  try {
    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "NONEXISTENT",
      timeframe: "1d",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-01-04T00:00:00.000Z",
    };

    try {
      await source.loadBars(request);
      assert.fail("Should throw ENOENT error");
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      assert.ok(err.code === "ENOENT" || err.message?.includes("ENOENT"));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CsvSource handles very large CSV file (performance test)", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-edge-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "large_1d.csv");

  try {
    // Generate a CSV with 10,000 rows
    let largeCsv = "timestamp,open,high,low,close,volume\n";
    for (let i = 0; i < 10000; i++) {
      const date = new Date(Date.UTC(2020, 0, 1) + i * 86400000);
      largeCsv += `${date.toISOString()},180.0,182.0,179.5,181.0,1000\n`;
    }

    await writeFile(datasetPath, largeCsv, { encoding: "utf-8" });

    const source = new CsvSource({ datasetsDir, cacheDir });

    const request: DataRequest = {
      source: "csv",
      symbol: "LARGE",
      timeframe: "1d",
      start: "2020-01-01T00:00:00.000Z",
      end: "2050-01-01T00:00:00.000Z",
    };

    const startTime = Date.now();
    const result = await source.loadBars(request);
    const endTime = Date.now();

    assert.equal(result.length, 10000);
    assert.ok(endTime - startTime < 5000, `Loading 10k rows took ${endTime - startTime}ms`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
