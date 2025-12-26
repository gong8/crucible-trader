import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DataRequest } from "@crucible-trader/sdk";

import type { Bar, IDataSource } from "./IDataSource.js";
import {
  filterBarsForRequest,
  sanitizeBar,
  slugify,
  sortBarsChronologically,
} from "./internalUtils.js";
import { createHttpClient, type HttpClient } from "./httpClient.js";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_ROOT = join(MODULE_DIR, "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const DEFAULT_CACHE_DIR = join(REPO_ROOT, "storage", "datasets", ".cache", "polygon");
const DEFAULT_BASE_URL = "https://api.polygon.io/v2/aggs/ticker";
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

interface PolygonCachePayload {
  readonly fetchedAt: number;
  readonly bars: ReadonlyArray<Bar>;
}

export interface PolygonSourceOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly cacheDir?: string;
  readonly cacheTtlMs?: number;
  readonly httpClient?: HttpClient;
}

type PolygonRecord = Record<string, unknown>;

interface RangeConfig {
  readonly multiplier: number;
  readonly timespan: string;
}

/**
 * Polygon Aggregates API backed data source.
 */
export class PolygonSource implements IDataSource {
  public readonly id = "polygon";

  private readonly apiKeyOverride?: string;
  private readonly baseUrl: string;
  private readonly cacheDir: string;
  private readonly cacheTtlMs: number;
  private readonly httpClient: HttpClient;

  public constructor(options: PolygonSourceOptions = {}) {
    this.apiKeyOverride = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, "");
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.httpClient = options.httpClient ?? createHttpClient();
  }

  public async loadBars(request: DataRequest): Promise<ReadonlyArray<Bar>> {
    if (!request.start || !request.end) {
      throw new Error("Polygon data requests require start and end dates");
    }
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error("Polygon API key missing. Set POLYGON_API_KEY environment variable.");
    }

    const cachePath = this.resolveCachePath(request);
    const cached = await this.readFreshCache(cachePath);
    if (cached) {
      return filterBarsForRequest(cached, request);
    }

    const fetched = await this.fetchBars(request, apiKey);
    const sorted = sortBarsChronologically(fetched);
    await this.writeCache(cachePath, sorted);
    return filterBarsForRequest(sorted, request);
  }

  private async fetchBars(request: DataRequest, apiKey: string): Promise<Bar[]> {
    const range = this.resolveRangeConfig(request.timeframe);
    const symbol = encodeURIComponent(request.symbol.toUpperCase());
    const url = new URL(
      `${this.baseUrl}/${symbol}/range/${range.multiplier}/${range.timespan}/${encodeURIComponent(request.start)}/${encodeURIComponent(request.end)}`,
    );
    url.searchParams.set("adjusted", request.adjusted === false ? "false" : "true");
    url.searchParams.set("sort", "asc");
    url.searchParams.set("limit", "50000");
    url.searchParams.set("apiKey", apiKey);

    const response = await this.httpClient.get(url.toString());

    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode === 404) {
        throw new Error(
          `Ticker symbol "${request.symbol}" not found. Please verify the ticker is valid and available on Polygon.`,
        );
      }
      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new Error(
          `Polygon authentication failed. Please verify your POLYGON_API_KEY is valid.`,
        );
      }
      if (response.statusCode === 400) {
        throw new Error(
          `Invalid request parameters for ${request.symbol}. Check that start date (${request.start}) and end date (${request.end}) are valid YYYY-MM-DD format and that the timeframe "${request.timeframe}" is supported.`,
        );
      }
      if (response.statusCode === 429) {
        throw new Error(`Polygon rate limit exceeded. Please wait before making more requests.`);
      }
      throw new Error(`Polygon request failed with status ${response.statusCode}`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch (error) {
      throw new Error(`Unable to parse Polygon response: ${String(error)}`);
    }

    const results = Array.isArray((payload as { results?: unknown })?.results)
      ? ((payload as { results: unknown[] }).results as PolygonRecord[])
      : [];

    if (results.length === 0) {
      const payloadStr = typeof payload === "object" ? JSON.stringify(payload) : String(payload);
      throw new Error(
        `Polygon returned no results for ${request.symbol} (${request.timeframe}) from ${request.start} to ${request.end}. Response: ${payloadStr.slice(0, 200)}`,
      );
    }

    return results.map((record) => this.toBar(record)).filter((bar): bar is Bar => bar !== null);
  }

  private toBar(record: PolygonRecord): Bar | null {
    const timestampValue = record.t;
    const open = toNumber(record.o);
    const high = toNumber(record.h);
    const low = toNumber(record.l);
    const close = toNumber(record.c);
    const volume = toNumber(record.v ?? record.av);

    if (
      (typeof timestampValue !== "number" && typeof timestampValue !== "string") ||
      [open, high, low, close, volume].some((value) => value === null)
    ) {
      return null;
    }

    const timestampMs =
      typeof timestampValue === "number"
        ? timestampValue
        : Number.isNaN(Number(timestampValue))
          ? null
          : Number(timestampValue);
    if (timestampMs === null) {
      return null;
    }

    return {
      timestamp: new Date(timestampMs).toISOString(),
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: volume as number,
    };
  }

  private async readFreshCache(cachePath: string): Promise<ReadonlyArray<Bar> | null> {
    try {
      const fileStat = await stat(cachePath);
      if (Date.now() - fileStat.mtimeMs > this.cacheTtlMs) {
        return null;
      }
      const buffer = await readFile(cachePath, { encoding: "utf-8" });
      const payload = JSON.parse(buffer) as PolygonCachePayload;
      if (!Array.isArray(payload?.bars)) {
        return null;
      }
      return payload.bars.map(sanitizeBar).filter((bar): bar is Bar => bar !== null);
    } catch {
      return null;
    }
  }

  private async writeCache(cachePath: string, bars: ReadonlyArray<Bar>): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const payload: PolygonCachePayload = {
      fetchedAt: Date.now(),
      bars,
    };
    await writeFile(cachePath, JSON.stringify(payload), { encoding: "utf-8" });
  }

  private resolveCachePath(request: DataRequest): string {
    const slug = [
      slugify(request.symbol),
      slugify(request.timeframe),
      request.adjusted === false ? "raw" : "adj",
    ]
      .filter((segment) => segment.length > 0)
      .join("_");
    return join(this.cacheDir, `${slug}.json`);
  }

  private resolveRangeConfig(timeframe: DataRequest["timeframe"]): RangeConfig {
    switch (timeframe) {
      case "1d":
        return { multiplier: 1, timespan: "day" };
      case "1h":
        return { multiplier: 1, timespan: "hour" };
      case "15m":
        return { multiplier: 15, timespan: "minute" };
      case "1m":
      default:
        return { multiplier: 1, timespan: "minute" };
    }
  }

  private resolveApiKey(): string {
    return this.apiKeyOverride ?? process.env.POLYGON_API_KEY ?? "";
  }
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

export const createPolygonSource = (options?: PolygonSourceOptions): PolygonSource => {
  return new PolygonSource(options);
};
