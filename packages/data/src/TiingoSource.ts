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
const DEFAULT_DAILY_BASE_URL = "https://api.tiingo.com/tiingo/daily";
const DEFAULT_IEX_BASE_URL = "https://api.tiingo.com/iex";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_CHUNK_DAYS = 180;
const DEFAULT_REQUEST_DELAY_MS = 1200;
const MAX_RANGE_BACKOFF_STEPS = 60;

interface TiingoCachePayload {
  readonly fetchedAt: number;
  readonly bars: ReadonlyArray<Bar>;
}

export interface TiingoSourceOptions {
  readonly apiKey?: string;
  readonly dailyBaseUrl?: string;
  readonly iexBaseUrl?: string;
  /** @deprecated Use dailyBaseUrl instead */
  readonly baseUrl?: string;
  readonly cacheDir?: string;
  readonly cacheTtlMs?: number;
  readonly httpClient?: HttpClient;
  readonly now?: () => number;
  readonly maxChunkDays?: number;
  readonly requestDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

type TiingoRecord = Record<string, unknown>;

interface FetchRange {
  readonly startDate: string;
  readonly endDate: string;
}

class TiingoBadRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TiingoBadRequestError";
  }
}

/**
 * Loads OHLCV data from Tiingo's REST API with local caching for determinism.
 */
export class TiingoSource implements IDataSource {
  public readonly id = "tiingo";

  private readonly apiKeyOverride?: string;
  private readonly dailyBaseUrl: string;
  private readonly iexBaseUrl: string;
  private readonly cacheDir: string;
  private readonly cacheTtlMs: number;
  private readonly httpClient: HttpClient;
  private readonly now: () => number;
  private readonly maxChunkDays: number;
  private readonly requestDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  public constructor(options: TiingoSourceOptions = {}) {
    this.apiKeyOverride = options.apiKey;
    // Support legacy baseUrl option for backwards compatibility
    this.dailyBaseUrl = (options.dailyBaseUrl ?? options.baseUrl ?? DEFAULT_DAILY_BASE_URL).replace(
      /\/+$/u,
      "",
    );
    this.iexBaseUrl = (options.iexBaseUrl ?? DEFAULT_IEX_BASE_URL).replace(/\/+$/u, "");
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.httpClient = options.httpClient ?? createHttpClient();
    this.now = options.now ?? Date.now;
    this.maxChunkDays = Math.max(1, options.maxChunkDays ?? DEFAULT_MAX_CHUNK_DAYS);
    this.requestDelayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  public async loadBars(request: DataRequest): Promise<ReadonlyArray<Bar>> {
    if (!request.start || !request.end) {
      throw new Error("Tiingo data requests require start and end dates");
    }
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error("Tiingo API key missing. Set TIINGO_API_KEY environment variable.");
    }

    const fetchRange = this.resolveFetchRange(request);
    if (!fetchRange) {
      // Requested window entirely in the future; Tiingo has nothing to return.
      return [];
    }

    const cachePath = this.resolveCachePath(request);
    const cached = await this.readFreshCache(cachePath);
    if (cached) {
      return filterBarsForRequest(cached, request);
    }

    const fetched = await this.fetchChunkedRange(request, fetchRange, apiKey);
    const sorted = sortBarsChronologically(fetched);
    await this.writeCache(cachePath, sorted);
    return filterBarsForRequest(sorted, request);
  }

  private async fetchChunkedRange(
    originalRequest: DataRequest,
    fetchRange: FetchRange,
    apiKey: string,
  ): Promise<Bar[]> {
    const startEpoch = parseRequestDate(fetchRange.startDate);
    const endEpoch = parseRequestDate(fetchRange.endDate);
    if (startEpoch === null || endEpoch === null || startEpoch > endEpoch) {
      return [];
    }

    const bars: Bar[] = [];
    let cursorEnd = endEpoch;
    const chunkSpanMs = (this.maxChunkDays - 1) * DAY_MS;

    while (cursorEnd >= startEpoch) {
      const chunkStartEpoch = Math.max(startEpoch, cursorEnd - chunkSpanMs);
      const range: FetchRange = {
        startDate: formatDate(chunkStartEpoch),
        endDate: formatDate(cursorEnd),
      };
      const chunkBars = await this.fetchWithBackoff(originalRequest, range, apiKey);
      bars.push(...chunkBars);
      cursorEnd = chunkStartEpoch - DAY_MS;
      if (cursorEnd >= startEpoch) {
        await this.sleep(this.requestDelayMs);
      }
    }

    return bars;
  }

  private async fetchWithBackoff(
    originalRequest: DataRequest,
    initialRange: FetchRange,
    apiKey: string,
  ): Promise<Bar[]> {
    let attempts = 0;
    let range = initialRange;

    for (;;) {
      const request: DataRequest = {
        ...originalRequest,
        start: range.startDate,
        end: range.endDate,
      };
      try {
        return await this.fetchBars(request, apiKey);
      } catch (error) {
        if (error instanceof TiingoRateLimitError) {
          await this.sleep(this.requestDelayMs);
          continue;
        }
        if (error instanceof TiingoBadRequestError) {
          if (attempts >= MAX_RANGE_BACKOFF_STEPS) {
            throw error;
          }
          const nextRange = this.backoffRange(range);
          if (!nextRange) {
            throw error;
          }
          range = nextRange;
          attempts += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private async fetchBars(request: DataRequest, apiKey: string): Promise<Bar[]> {
    const isIntraday = this.isIntradayTimeframe(request.timeframe);
    const baseUrl = isIntraday ? this.iexBaseUrl : this.dailyBaseUrl;
    const url = new URL(`${baseUrl}/${encodeURIComponent(request.symbol)}/prices`);

    url.searchParams.set("startDate", request.start);
    url.searchParams.set("endDate", request.end);

    if (!isIntraday) {
      url.searchParams.set("format", "json");
      const frequency = this.getDailyFrequency(request.timeframe);
      if (frequency) {
        url.searchParams.set("frequency", frequency);
      }
    } else {
      const resampleFreq = this.getIntradayResampleFreq(request.timeframe);
      if (resampleFreq) {
        url.searchParams.set("resampleFreq", resampleFreq);
      }
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
      if (response.statusCode === 404) {
        throw new Error(
          `Ticker symbol "${request.symbol}" not found. Please verify the ticker is valid and available on Tiingo.`,
        );
      }
      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new Error(
          `Tiingo authentication failed. Please verify your TIINGO_API_KEY is valid.`,
        );
      }
      if (response.statusCode === 400) {
        throw new TiingoBadRequestError(
          `Invalid request parameters for ${request.symbol}. Check that start date (${request.start}) and end date (${request.end}) are valid YYYY-MM-DD format.`,
        );
      }
      if (response.statusCode === 429) {
        throw new TiingoRateLimitError(
          "Tiingo rate limit exceeded. Please wait before making more requests.",
        );
      }
      throw new Error(`Tiingo request failed with status ${response.statusCode}`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch (error) {
      throw new Error(`Unable to parse Tiingo response: ${String(error)}`);
    }

    if (!Array.isArray(payload)) {
      // Log the actual response to help debug
      const payloadStr = typeof payload === "object" ? JSON.stringify(payload) : String(payload);
      throw new Error(
        `Tiingo returned non-array response for ${request.symbol}: ${payloadStr.slice(0, 200)}`,
      );
    }

    // Allow empty responses - weekends/holidays may have no trading data
    // The chunking logic and filtering will handle this appropriately
    if (payload.length === 0) {
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
      request.adjusted === false ? "raw" : "adj",
    ]
      .filter((segment) => segment.length > 0)
      .join("_");
    return join(this.cacheDir, `${slug}.json`);
  }

  private resolveFetchRange(request: DataRequest): FetchRange | null {
    const startEpoch = parseRequestDate(request.start);
    const endEpoch = parseRequestDate(request.end);
    if (startEpoch === null || endEpoch === null) {
      throw new Error(
        `Tiingo requires valid ISO dates. Received start="${request.start}" end="${request.end}".`,
      );
    }

    const today = new Date(this.now());
    today.setUTCHours(0, 0, 0, 0);
    const todayEpoch = today.getTime();

    const clampedEnd = Math.min(endEpoch, todayEpoch);
    if (clampedEnd < startEpoch) {
      return null;
    }

    const clampedStart = Math.min(startEpoch, clampedEnd);
    return {
      startDate: formatDate(clampedStart),
      endDate: formatDate(clampedEnd),
    };
  }

  private backoffRange(range: FetchRange): FetchRange | null {
    const startEpoch = parseRequestDate(range.startDate);
    const endEpoch = parseRequestDate(range.endDate);
    if (startEpoch === null || endEpoch === null) {
      return null;
    }
    const nextEnd = endEpoch - DAY_MS;
    if (nextEnd < startEpoch) {
      return null;
    }
    return {
      startDate: range.startDate,
      endDate: formatDate(nextEnd),
    };
  }

  /**
   * Determines if a timeframe requires intraday data (IEX endpoint).
   */
  private isIntradayTimeframe(timeframe: DataRequest["timeframe"]): boolean {
    return timeframe === "1h" || timeframe === "15m" || timeframe === "1m";
  }

  /**
   * Gets the resampleFreq parameter for IEX endpoint (intraday data).
   */
  private getIntradayResampleFreq(timeframe: DataRequest["timeframe"]): string | null {
    switch (timeframe) {
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

  /**
   * Gets the frequency parameter for daily endpoint (end-of-day data).
   */
  private getDailyFrequency(timeframe: DataRequest["timeframe"]): string | null {
    switch (timeframe) {
      case "1d":
        return "daily";
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

const parseRequestDate = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : epoch;
};

const formatDate = (epochMs: number): string => {
  return new Date(epochMs).toISOString().slice(0, 10);
};

const defaultSleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

class TiingoRateLimitError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TiingoRateLimitError";
  }
}
