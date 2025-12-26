import { strict as assert } from "node:assert";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { URL } from "node:url";

import type { DataRequest } from "@crucible-trader/sdk";

import { TiingoSource } from "../src/TiingoSource.js";
import type { HttpClient, HttpResponse } from "../src/httpClient.js";

const SAMPLE_RESPONSE = JSON.stringify([
  {
    date: "2024-01-02T00:00:00.000Z",
    open: 180,
    high: 182,
    low: 179,
    close: 181,
    volume: 1000,
  },
  {
    date: "2024-01-03T00:00:00.000Z",
    open: 181,
    high: 183,
    low: 180,
    close: 182,
    volume: 1100,
  },
  {
    date: "2024-01-04T00:00:00.000Z",
    open: 182,
    high: 184,
    low: 181,
    close: 183,
    volume: 1200,
  },
]);

const NOOP_SLEEP = async (): Promise<void> => {};

class FakeHttpClient implements HttpClient {
  public calls: string[] = [];

  public constructor(private readonly responseBody: string) {}

  public async get(url: string): Promise<HttpResponse> {
    this.calls.push(url);
    return {
      statusCode: 200,
      body: this.responseBody,
      headers: {},
    };
  }
}

test("TiingoSource fetches, caches, and filters bars", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "tiingo-source-"));
  const httpClient = new FakeHttpClient(SAMPLE_RESPONSE);
  const source = new TiingoSource({
    apiKey: "test-key",
    cacheDir,
    httpClient,
    cacheTtlMs: Number.MAX_SAFE_INTEGER,
    now: () => Date.parse("2024-02-01T00:00:00.000Z"),
    sleep: NOOP_SLEEP,
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-02T00:00:00.000Z",
    end: "2024-01-05T00:00:00.000Z",
    adjusted: true,
  };

  const first = await source.loadBars(request);
  assert.equal(first.length, 3);
  assert.equal(httpClient.calls.length, 1);
  assert.equal(first[0]?.timestamp, "2024-01-02T00:00:00.000Z");

  const cached = await source.loadBars(request);
  assert.equal(cached.length, 3);
  assert.equal(httpClient.calls.length, 1, "should not refetch when cache fresh");

  const filtered = await source.loadBars({
    ...request,
    start: "2024-01-03T00:00:00.000Z",
  });
  assert.equal(filtered.length, 2, "should filter cached bars per request start");
  assert.equal(httpClient.calls.length, 1);
});

test("TiingoSource clamps future end dates before requesting data", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "tiingo-clamp-"));
  const httpClient = new FakeHttpClient(SAMPLE_RESPONSE);
  const source = new TiingoSource({
    apiKey: "test-key",
    cacheDir,
    httpClient,
    now: () => Date.parse("2025-01-15T00:00:00.000Z"),
    sleep: NOOP_SLEEP,
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-12-25",
    end: "2025-12-25",
    adjusted: true,
  };

  await source.loadBars(request);
  assert.equal(httpClient.calls.length, 1);
  const url = new URL(httpClient.calls[0] ?? "");
  assert.equal(url.searchParams.get("startDate"), "2024-12-25");
  assert.equal(url.searchParams.get("endDate"), "2025-01-15");
});

test("TiingoSource skips HTTP requests when entire range is in the future", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "tiingo-future-only-"));
  const httpClient = new FakeHttpClient(SAMPLE_RESPONSE);
  const source = new TiingoSource({
    apiKey: "test-key",
    cacheDir,
    httpClient,
    now: () => Date.parse("2024-09-01T00:00:00.000Z"),
    sleep: NOOP_SLEEP,
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-12-25",
    end: "2025-01-31",
    adjusted: true,
  };

  const result = await source.loadBars(request);
  assert.equal(result.length, 0);
  assert.equal(httpClient.calls.length, 0);
});

test("TiingoSource retries with an earlier end date after Tiingo rejects the range", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "tiingo-retry-"));
  const calls: string[] = [];
  let attempt = 0;
  const httpClient: HttpClient = {
    get: async (url: string): Promise<HttpResponse> => {
      calls.push(url);
      attempt += 1;
      if (attempt === 1) {
        return { statusCode: 400, body: "{}", headers: {} };
      }
      return { statusCode: 200, body: SAMPLE_RESPONSE, headers: {} };
    },
  };

  const source = new TiingoSource({
    apiKey: "test-key",
    cacheDir,
    httpClient,
    now: () => Date.parse("2025-01-15T00:00:00.000Z"),
    sleep: NOOP_SLEEP,
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-12-25",
    end: "2025-12-25",
    adjusted: true,
  };

  await source.loadBars(request);
  assert.equal(calls.length, 2);

  const first = new URL(calls[0] ?? "");
  const second = new URL(calls[1] ?? "");
  assert.equal(first.searchParams.get("endDate"), "2025-01-15");
  assert.equal(second.searchParams.get("endDate"), "2025-01-14");
  assert.equal(second.searchParams.get("startDate"), "2024-12-25");
});

test("TiingoSource splits long requests into multiple chunks", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "tiingo-chunks-"));
  const calls: string[] = [];
  const sleepCalls: number[] = [];
  const httpClient: HttpClient = {
    async get(url: string): Promise<HttpResponse> {
      calls.push(url);
      return {
        statusCode: 200,
        body: SAMPLE_RESPONSE,
        headers: {},
      };
    },
  };

  const source = new TiingoSource({
    apiKey: "test-key",
    cacheDir,
    httpClient,
    now: () => Date.parse("2025-02-01T00:00:00.000Z"),
    maxChunkDays: 10,
    requestDelayMs: 10,
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
    },
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-02-15",
  };

  await source.loadBars(request);
  assert.equal(calls.length, 5, "should split into 10-day windows");
  const firstCall = new URL(calls[0] ?? "");
  assert.equal(firstCall.searchParams.get("startDate"), "2024-02-06");
  assert.equal(firstCall.searchParams.get("endDate"), "2024-02-15");
  const lastCall = new URL(calls[calls.length - 1] ?? "");
  assert.equal(lastCall.searchParams.get("startDate"), "2024-01-01");
  assert.deepEqual(sleepCalls, [10, 10, 10, 10]);
});

test("TiingoSource retries after rate limit by waiting before reissuing the same chunk", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "tiingo-rate-"));
  const calls: string[] = [];
  const sleepCalls: number[] = [];
  let attempt = 0;
  const httpClient: HttpClient = {
    async get(url: string): Promise<HttpResponse> {
      calls.push(url);
      attempt += 1;
      if (attempt === 1) {
        return {
          statusCode: 429,
          body: "{}",
          headers: {},
        };
      }
      return {
        statusCode: 200,
        body: SAMPLE_RESPONSE,
        headers: {},
      };
    },
  };

  const source = new TiingoSource({
    apiKey: "test-key",
    cacheDir,
    httpClient,
    now: () => Date.parse("2025-01-15T00:00:00.000Z"),
    maxChunkDays: 10,
    requestDelayMs: 15,
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
    },
  });

  const request: DataRequest = {
    source: "tiingo",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-02",
    end: "2024-01-04",
  };

  const bars = await source.loadBars(request);
  assert.equal(bars.length, 3);
  assert.equal(calls.length, 2);
  assert.deepEqual(sleepCalls, [15]);
});
