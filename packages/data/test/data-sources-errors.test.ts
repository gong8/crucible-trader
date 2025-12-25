import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DataRequest } from "@crucible-trader/sdk";
import { CsvSource } from "../src/CsvSource.js";
import { TiingoSource } from "../src/TiingoSource.js";
import { PolygonSource } from "../src/PolygonSource.js";

// ============================================================================
// CSV Source Error Handling
// ============================================================================

test("CsvSource throws descriptive error when file doesn't exist", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "csv-error-"));
  const source = new CsvSource({ datasetsDir: tempDir, cacheDir: join(tempDir, ".cache") });

  const request: DataRequest = {
    source: "csv",
    symbol: "NONEXISTENT",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  await assert.rejects(
    async () => {
      await source.loadBars(request);
    },
    {
      code: "ENOENT",
    },
  );

  await rm(tempDir, { recursive: true, force: true });
});

test("CsvSource handles malformed CSV gracefully", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "csv-malformed-"));
  const datasetsDir = tempDir;
  const cacheDir = join(tempDir, ".cache");
  const datasetPath = join(datasetsDir, "bad_1d.csv");

  // Write malformed CSV (missing columns, bad data)
  const badCsv = `timestamp,open,high,low,close,volume
2024-01-01T00:00:00.000Z,not-a-number,105,95,102,1000
invalid-timestamp,100,105,95,102,1000
2024-01-02T00:00:00.000Z,100,105,95,102,not-a-number`;

  await writeFile(datasetPath, badCsv);

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const source = new CsvSource({ datasetsDir, cacheDir });

  const request: DataRequest = {
    source: "csv",
    symbol: "BAD",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-03",
  };

  const bars = await source.loadBars(request);

  // Should skip invalid rows and only return valid ones (none in this case)
  assert.ok(Array.isArray(bars));
  // Most rows should be filtered out due to bad data
  assert.ok(bars.length < 3);
});

test("CsvSource handles empty CSV file", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "csv-empty-"));
  const datasetsDir = tempDir;
  const cacheDir = join(tempDir, ".cache");
  const datasetPath = join(datasetsDir, "empty_1d.csv");

  await writeFile(datasetPath, "timestamp,open,high,low,close,volume\n");

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const source = new CsvSource({ datasetsDir, cacheDir });

  const request: DataRequest = {
    source: "csv",
    symbol: "EMPTY",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  const bars = await source.loadBars(request);

  assert.equal(bars.length, 0, "Empty CSV should return empty array");
});

test("CsvSource handles CSV with only headers", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "csv-headers-"));
  const datasetsDir = tempDir;
  const cacheDir = join(tempDir, ".cache");
  const datasetPath = join(datasetsDir, "headers_1d.csv");

  await writeFile(datasetPath, "timestamp,open,high,low,close,volume");

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const source = new CsvSource({ datasetsDir, cacheDir });

  const request: DataRequest = {
    source: "csv",
    symbol: "HEADERS",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  const bars = await source.loadBars(request);

  assert.equal(bars.length, 0);
});

test("CsvSource handles missing required columns", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "csv-missing-cols-"));
  const datasetsDir = tempDir;
  const cacheDir = join(tempDir, ".cache");
  const datasetPath = join(datasetsDir, "missing_1d.csv");

  // Missing 'volume' column
  const badCsv = `timestamp,open,high,low,close
2024-01-01T00:00:00.000Z,100,105,95,102`;

  await writeFile(datasetPath, badCsv);

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const source = new CsvSource({ datasetsDir, cacheDir });

  const request: DataRequest = {
    source: "csv",
    symbol: "MISSING",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  // Should handle missing columns gracefully
  const bars = await source.loadBars(request);
  // Rows with missing required fields should be filtered out
  assert.ok(Array.isArray(bars));
});

// ============================================================================
// Tiingo Source Error Handling
// ============================================================================

test("TiingoSource throws error when API key is missing", async () => {
  const source = new TiingoSource(); // No API key provided

  // Temporarily remove env var if it exists
  const originalKey = process.env.TIINGO_API_KEY;
  delete process.env.TIINGO_API_KEY;

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  try {
    await assert.rejects(
      async () => {
        await source.loadBars(request);
      },
      {
        message: /API key missing/,
      },
    );
  } finally {
    // Restore original key
    if (originalKey) {
      process.env.TIINGO_API_KEY = originalKey;
    }
  }
});

test("TiingoSource requires start and end dates", async () => {
  const source = new TiingoSource({ apiKey: "test-key" });

  const request = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "",
    end: "",
  } as DataRequest;

  await assert.rejects(
    async () => {
      await source.loadBars(request);
    },
    {
      message: /require start and end dates/,
    },
  );
});

test("TiingoSource handles HTTP errors gracefully", async () => {
  const mockHttpClient = {
    get: async () => ({
      statusCode: 500,
      body: "Internal Server Error",
      headers: {},
    }),
  };

  const source = new TiingoSource({
    apiKey: "test-key",
    httpClient: mockHttpClient,
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  await assert.rejects(
    async () => {
      await source.loadBars(request);
    },
    {
      message: /failed with status 500/,
    },
  );
});

test("TiingoSource handles malformed JSON response", async () => {
  const mockHttpClient = {
    get: async () => ({
      statusCode: 200,
      body: "not valid json{",
      headers: {},
    }),
  };

  const source = new TiingoSource({
    apiKey: "test-key",
    httpClient: mockHttpClient,
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  await assert.rejects(
    async () => {
      await source.loadBars(request);
    },
    {
      message: /Unable to parse.*response/,
    },
  );
});

test("TiingoSource handles empty response array", async () => {
  const mockHttpClient = {
    get: async () => ({
      statusCode: 200,
      body: "[]",
      headers: {},
    }),
  };

  const source = new TiingoSource({
    apiKey: "test-key",
    httpClient: mockHttpClient,
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  const bars = await source.loadBars(request);

  assert.equal(bars.length, 0, "Empty response should return empty array");
});

test("TiingoSource handles non-array response", async () => {
  const mockHttpClient = {
    get: async () => ({
      statusCode: 200,
      body: '{"error": "Not found"}',
      headers: {},
    }),
  };

  const source = new TiingoSource({
    apiKey: "test-key",
    httpClient: mockHttpClient,
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  const bars = await source.loadBars(request);

  assert.equal(bars.length, 0, "Non-array response should return empty array");
});

// ============================================================================
// Polygon Source Error Handling
// ============================================================================

test("PolygonSource throws error when API key is missing", async () => {
  const source = new PolygonSource();

  const originalKey = process.env.POLYGON_API_KEY;
  delete process.env.POLYGON_API_KEY;

  const request: DataRequest = {
    source: "polygon",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  try {
    await assert.rejects(
      async () => {
        await source.loadBars(request);
      },
      {
        message: /API key missing/,
      },
    );
  } finally {
    if (originalKey) {
      process.env.POLYGON_API_KEY = originalKey;
    }
  }
});

test("PolygonSource requires start and end dates", async () => {
  const source = new PolygonSource({ apiKey: "test-key" });

  const request = {
    source: "polygon",
    symbol: "AAPL",
    timeframe: "1d",
    start: "",
    end: "",
  } as DataRequest;

  await assert.rejects(
    async () => {
      await source.loadBars(request);
    },
    {
      message: /require start and end dates/,
    },
  );
});

test("PolygonSource handles HTTP errors", async () => {
  const mockHttpClient = {
    get: async () => ({
      statusCode: 401,
      body: "Unauthorized",
      headers: {},
    }),
  };

  const source = new PolygonSource({
    apiKey: "test-key",
    httpClient: mockHttpClient,
  });

  const request: DataRequest = {
    source: "polygon",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  await assert.rejects(
    async () => {
      await source.loadBars(request);
    },
    {
      message: /failed with status 401/,
    },
  );
});

test("PolygonSource handles missing results in response", async () => {
  const mockHttpClient = {
    get: async () => ({
      statusCode: 200,
      body: '{"status": "OK"}',
      headers: {},
    }),
  };

  const source = new PolygonSource({
    apiKey: "test-key",
    httpClient: mockHttpClient,
  });

  const request: DataRequest = {
    source: "polygon",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  const bars = await source.loadBars(request);

  assert.equal(bars.length, 0, "Response without results should return empty array");
});

test("PolygonSource filters out bars with missing data", async () => {
  const mockHttpClient = {
    get: async () => ({
      statusCode: 200,
      body: JSON.stringify({
        results: [
          { t: 1704067200000, o: 100, h: 105, l: 95, c: 102, v: 1000 }, // Valid
          { t: 1704153600000, o: null, h: 107, l: 98, c: 104, v: 1200 }, // Missing open
          { t: 1704240000000, o: 104, h: 109, l: 100, c: 106 }, // Missing volume
          { t: 1704326400000, o: 106, h: 111, l: 102, c: 108, v: 1300 }, // Valid
        ],
      }),
      headers: {},
    }),
  };

  const source = new PolygonSource({
    apiKey: "test-key",
    httpClient: mockHttpClient,
  });

  const request: DataRequest = {
    source: "polygon",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  const bars = await source.loadBars(request);

  assert.equal(bars.length, 2, "Should filter out bars with missing data");
  assert.equal(bars[0]?.open, 100);
  assert.equal(bars[1]?.open, 106);
});

test("PolygonSource handles invalid timestamp formats", async () => {
  const mockHttpClient = {
    get: async () => ({
      statusCode: 200,
      body: JSON.stringify({
        results: [
          { t: "invalid", o: 100, h: 105, l: 95, c: 102, v: 1000 },
          { t: 1704067200000, o: 100, h: 105, l: 95, c: 102, v: 1000 }, // Valid
        ],
      }),
      headers: {},
    }),
  };

  const source = new PolygonSource({
    apiKey: "test-key",
    httpClient: mockHttpClient,
  });

  const request: DataRequest = {
    source: "polygon",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
  };

  const bars = await source.loadBars(request);

  assert.equal(bars.length, 1, "Should filter out bars with invalid timestamps");
});
