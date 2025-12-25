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
const DEFAULT_CACHE_DIR = join(REPO_ROOT, "storage", "datasets", ".cache", "tiingo");
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const DEFAULT_BASE_URL = "https://api.tiingo.com/tiingo/daily";

interface TiingoCachePayload {
  readonly fetchedAt: number;
  readonly bars: ReadonlyArray<Bar>;
}

export interface TiingoSourceOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly cacheDir?: string;
  readonly cacheTtlMs?: number;
  readonly httpClient?: HttpClient;
}

type TiingoRecord = Record<string, unknown>;

/**
 * Loads OHLCV data from Tiingo's REST API with local caching for determinism.
 */
export class TiingoSource implements IDataSource {
  public readonly id = "tiingo";

  private readonly apiKeyOverride?: string;
  private readonly baseUrl: string;
  private readonly cacheDir: string;
  private readonly cacheTtlMs: number;
  private readonly httpClient: HttpClient;

  public constructor(options: TiingoSourceOptions = {}) {
    this.apiKeyOverride = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, "");
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.httpClient = options.httpClient ?? createHttpClient();
  }

  public async loadBars(request: DataRequest): Promise<ReadonlyArray<Bar>> {
    if (!request.start || !request.end) {
      throw new Error("Tiingo data requests require start and end dates");
    }
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error("Tiingo API key missing. Set TIINGO_API_KEY environment variable.");
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
    const url = new URL(`${this.baseUrl}/${encodeURIComponent(request.symbol)}/prices`);
    url.searchParams.set("startDate", request.start);
    url.searchParams.set("endDate", request.end);
    url.searchParams.set("format", "json");
    const resampleFrequency = this.getResampleFrequency(request.timeframe);
    if (resampleFrequency) {
      url.searchParams.set("resampleFreq", resampleFrequency);
    }
    if (request.adjusted === false) {
      url.searchParams.set("adjusted", "false");
    } else {
      url.searchParams.set("adjusted", "true");
    }

    const response = await this.httpClient.get(url.toString(), {
      headers: { Authorization: `Token ${apiKey}` },
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Tiingo request failed with status ${response.statusCode}`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch (error) {
      throw new Error(`Unable to parse Tiingo response: ${String(error)}`);
    }

    if (!Array.isArray(payload)) {
      return [];
    }

    const useAdjusted = request.adjusted !== false;
    return payload
      .map((record) => this.toBar(record as TiingoRecord, useAdjusted))
      .filter((bar): bar is Bar => bar !== null);
  }

  private toBar(record: TiingoRecord, useAdjusted: boolean): Bar | null {
    const timestamp =
      typeof record.date === "string"
        ? record.date
        : typeof record.timestamp === "string"
          ? record.timestamp
          : null;
    if (!timestamp) {
      return null;
    }
    const pickPrice = (primaryKey: string, adjustedKey: string): number | null => {
      const adjustedValue = useAdjusted ? toNumber(record[adjustedKey]) : null;
      const primaryValue = toNumber(record[primaryKey]);
      if (useAdjusted && adjustedValue !== null) {
        return adjustedValue;
      }
      return primaryValue;
    };

    const open = pickPrice("open", "adjOpen");
    const high = pickPrice("high", "adjHigh");
    const low = pickPrice("low", "adjLow");
    const close = pickPrice("close", "adjClose");
    const volume = toNumber(record.volume ?? record.adjVolume);

    if ([open, high, low, close, volume].some((value) => value === null)) {
      return null;
    }

    return {
      timestamp: new Date(timestamp).toISOString(),
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
      const payload = JSON.parse(buffer) as TiingoCachePayload;
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
    const payload: TiingoCachePayload = {
      fetchedAt: Date.now(),
      bars,
    };
    await writeFile(cachePath, JSON.stringify(payload), { encoding: "utf-8" });
  }

  private resolveCachePath(request: DataRequest): string {
    const slug = [
      slugify(request.symbol),
      slugify(request.timeframe),
      slugify(request.start),
      slugify(request.end),
      request.adjusted === false ? "raw" : "adj",
    ]
      .filter((segment) => segment.length > 0)
      .join("_");
    return join(this.cacheDir, `${slug}.json`);
  }

  private getResampleFrequency(timeframe: DataRequest["timeframe"]): string | null {
    switch (timeframe) {
      case "1d":
        return "1day";
      case "1h":
        return "1hour";
      case "15m":
        return "15min";
      case "1m":
        return "1min";
      default:
        return null;
    }
  }

  private resolveApiKey(): string {
    return this.apiKeyOverride ?? process.env.TIINGO_API_KEY ?? "";
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

/**
 * Factory to align with existing CsvSource ergonomics.
 */
export const createTiingoSource = (options?: TiingoSourceOptions): TiingoSource => {
  return new TiingoSource(options);
};
