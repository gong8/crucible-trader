import { dirname, join, normalize } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { DataRequest } from "@crucible-trader/sdk";
import type { Bar } from "@crucible-trader/data";
import { PolygonSource, TiingoSource } from "@crucible-trader/data";

const tiingoSource = new TiingoSource();
const polygonSource = new PolygonSource();

const ROUTES_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(ROUTES_DIR, "..", "..", "..", "..");

export const DATASETS_DIR = join(REPO_ROOT, "storage", "datasets");
export const DATASET_RELATIVE_ROOT = normalize(join("storage", "datasets"));

export interface FetchDatasetArgs {
  readonly source: "tiingo" | "polygon";
  readonly request: DataRequest;
  readonly datasetPath: string;
}

export interface FetchDatasetResult {
  readonly rows: number;
  readonly start: string | null;
  readonly end: string | null;
}

export type RemoteSource = "tiingo" | "polygon";

/**
 * Downloads bars from a remote vendor and persists them as CSV for offline reuse.
 */
export const fetchRemoteDataset = async ({
  source,
  request,
  datasetPath,
}: FetchDatasetArgs): Promise<FetchDatasetResult> => {
  const loader = source === "tiingo" ? tiingoSource : polygonSource;
  const bars = await loader.loadBars(request);
  if (!bars || bars.length === 0) {
    throw new Error(`No data returned for ${request.symbol} (${request.timeframe}) via ${source}`);
  }

  const sorted = [...bars].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await mkdir(dirname(datasetPath), { recursive: true });
  await writeFile(datasetPath, serializeBarsToCsv(sorted), { encoding: "utf-8" });

  // Extract just the date portion (YYYY-MM-DD) from timestamps
  const extractDate = (timestamp: string): string => {
    if (timestamp.includes("T")) {
      const parts = timestamp.split("T");
      return parts[0] ?? timestamp.slice(0, 10);
    }
    return timestamp.slice(0, 10);
  };

  const firstBar = sorted[0];
  const lastBar = sorted[sorted.length - 1];

  return {
    rows: sorted.length,
    start: firstBar?.timestamp ? extractDate(firstBar.timestamp) : null,
    end: lastBar?.timestamp ? extractDate(lastBar.timestamp) : null,
  };
};

export const fetchDatasetWithFallback = async ({
  preferredSources,
  request,
  datasetPath,
}: {
  readonly preferredSources: ReadonlyArray<RemoteSource>;
  readonly request: DataRequest;
  readonly datasetPath: string;
}): Promise<FetchDatasetResult & { readonly source: RemoteSource }> => {
  const failures: string[] = [];
  for (const remoteSource of preferredSources) {
    try {
      const result = await fetchRemoteDataset({
        source: remoteSource,
        request,
        datasetPath,
      });
      return { ...result, source: remoteSource };
    } catch (error) {
      failures.push(`${remoteSource}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length === 0) {
    throw new Error("no remote sources configured");
  }

  throw new Error(`all remote sources failed → ${failures.join(" | ")}`);
};

export const buildDatasetFilename = (symbol: string, timeframe: string): string => {
  return `${slugify(symbol)}_${slugify(timeframe)}.csv`;
};

export const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
};

const serializeBarsToCsv = (bars: ReadonlyArray<Bar>): string => {
  const header = "timestamp,open,high,low,close,volume";
  const lines = bars.map((bar) =>
    [
      bar.timestamp,
      toFixed(bar.open),
      toFixed(bar.high),
      toFixed(bar.low),
      toFixed(bar.close),
      toFixed(bar.volume),
    ].join(","),
  );
  return `${header}\n${lines.join("\n")}\n`;
};

const toFixed = (value: number): string => {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "");
};

export const extractCsvMetadata = (
  content: string,
): { readonly start: string | null; readonly end: string | null; readonly rows: number } => {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) {
    return { start: null, end: null, rows: 0 };
  }
  const rows = lines.slice(1);
  const first = rows[0]?.split(",")[0]?.trim() ?? null;
  const last = rows[rows.length - 1]?.split(",")[0]?.trim() ?? null;

  // Extract just the date portion (YYYY-MM-DD) from ISO timestamps
  const normalizeDate = (timestamp: string | null): string | null => {
    if (!timestamp) return null;
    // If it's an ISO timestamp, extract the date part
    if (timestamp.includes("T")) {
      return timestamp.split("T")[0] ?? null;
    }
    // If it's already YYYY-MM-DD, return as-is
    return timestamp.length >= 10 ? timestamp.slice(0, 10) : timestamp;
  };

  return {
    start: normalizeDate(first),
    end: normalizeDate(last),
    rows: rows.length,
  };
};
