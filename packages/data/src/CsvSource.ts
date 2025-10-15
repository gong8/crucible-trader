import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { DataRequest } from "@crucible-trader/sdk";

import type { Bar, IDataSource } from "./IDataSource.js";

const DEFAULT_DATASETS_DIR = join(process.cwd(), "storage", "datasets");
const DEFAULT_CACHE_DIR = join(DEFAULT_DATASETS_DIR, ".cache");

interface CsvCachePayload {
  readonly mtimeMs: number;
  readonly bars: ReadonlyArray<Bar>;
}

export interface CsvSourceOptions {
  readonly datasetsDir?: string;
  readonly cacheDir?: string;
}

/**
 * CSV-backed data source that parses instrument bars and caches them for reuse.
 */
export class CsvSource implements IDataSource {
  public readonly id = "csv";

  private readonly datasetsDir: string;
  private readonly cacheDir: string;

  public constructor(options: CsvSourceOptions = {}) {
    this.datasetsDir = options.datasetsDir ?? DEFAULT_DATASETS_DIR;
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  }

  public async loadBars(request: DataRequest): Promise<ReadonlyArray<Bar>> {
    const datasetPath = this.resolveDatasetPath(request);

    let datasetStat: Awaited<ReturnType<typeof stat>>;
    try {
      datasetStat = await stat(datasetPath);
    } catch {
      return [];
    }

    const cachePath = this.resolveCachePath(request);
    const cached = await this.readCache(cachePath, datasetStat.mtimeMs);
    if (cached) {
      return this.filterBarsForRequest(cached, request);
    }

    const content = await readFile(datasetPath, { encoding: "utf-8" });
    const parsed = this.parseCsv(content);
    const filtered = this.filterBarsForRequest(parsed, request);

    await this.writeCache(cachePath, {
      mtimeMs: datasetStat.mtimeMs,
      bars: parsed,
    });

    return filtered;
  }

  private resolveDatasetPath(request: DataRequest): string {
    const symbolSlug = slugify(request.symbol);
    const timeframeSlug = slugify(request.timeframe);
    const filename = `${symbolSlug}_${timeframeSlug}.csv`;
    return join(this.datasetsDir, filename);
  }

  private resolveCachePath(request: DataRequest): string {
    const symbolSlug = slugify(request.symbol);
    const timeframeSlug = slugify(request.timeframe);
    const filename = `${symbolSlug}_${timeframeSlug}.json`;
    return join(this.cacheDir, filename);
  }

  private async readCache(
    cachePath: string,
    expectedMtimeMs: number,
  ): Promise<ReadonlyArray<Bar> | null> {
    try {
      const buffer = await readFile(cachePath, { encoding: "utf-8" });
      const payload = JSON.parse(buffer) as CsvCachePayload;
      if (payload?.mtimeMs === expectedMtimeMs && Array.isArray(payload?.bars)) {
        return payload.bars.map(sanitizeBar).filter((bar): bar is Bar => bar !== null);
      }
    } catch {
      /* swallow cache errors */
    }
    return null;
  }

  private async writeCache(cachePath: string, payload: CsvCachePayload): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(cachePath, JSON.stringify(payload), { encoding: "utf-8" });
  }

  private parseCsv(content: string): ReadonlyArray<Bar> {
    const lines = content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return [];
    }

    // Remove header row.
    const [, ...rows] = lines;
    const map = new Map<string, Bar>();

    for (const row of rows) {
      const bar = toBar(row);
      if (bar) {
        map.set(bar.timestamp, bar);
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.timestamp === b.timestamp) {
        return 0;
      }
      return a.timestamp < b.timestamp ? -1 : 1;
    });
  }

  private filterBarsForRequest(bars: ReadonlyArray<Bar>, request: DataRequest): ReadonlyArray<Bar> {
    const { start, end } = request;
    if (!start && !end) {
      return bars;
    }

    return bars.filter((bar) => {
      const isAfterStart = start ? bar.timestamp >= start : true;
      const isBeforeEnd = end ? bar.timestamp <= end : true;
      return isAfterStart && isBeforeEnd;
    });
  }
}

const toBar = (row: string): Bar | null => {
  const [timestamp, openStr, highStr, lowStr, closeStr, volumeStr] = row.split(",").map((part) => part.trim());

  if (!timestamp) {
    return null;
  }

  const open = Number(openStr);
  const high = Number(highStr);
  const low = Number(lowStr);
  const close = Number(closeStr);
  const volume = Number(volumeStr);

  if ([open, high, low, close, volume].some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
  };
};

const sanitizeBar = (maybeBar: Bar | null | undefined): Bar | null => {
  if (!maybeBar) {
    return null;
  }

  const { timestamp, open, high, low, close, volume } = maybeBar;
  if (
    typeof timestamp !== "string" ||
    typeof open !== "number" ||
    typeof high !== "number" ||
    typeof low !== "number" ||
    typeof close !== "number" ||
    typeof volume !== "number"
  ) {
    return null;
  }

  return { timestamp, open, high, low, close, volume };
};

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
};

/**
 * Factory used by callers to construct the CSV data source.
 */
export const createCsvSource = (options?: CsvSourceOptions): CsvSource => {
  return new CsvSource(options);
};
