import { join, normalize } from "node:path";
import { readFile, stat } from "node:fs/promises";

import type { BacktestRequest, DataRequest } from "@crucible-trader/sdk";

import {
  DATASET_RELATIVE_ROOT,
  DATASETS_DIR,
  buildDatasetFilename,
  extractCsvMetadata,
  fetchDatasetWithFallback,
  type RemoteSource,
} from "./data-fetchers.js";

interface DatasetRecordPayload {
  source: string;
  symbol: string;
  timeframe: string;
  start?: string | null;
  end?: string | null;
  adjusted?: boolean;
  path: string;
  checksum?: string | null;
  rows: number;
  createdAt: string;
}

export interface DatasetEnsurerDeps {
  readonly saveDataset: (record: DatasetRecordPayload) => Promise<void>;
  readonly findDatasetRecord?: (args: {
    symbol: string;
    timeframe: string;
  }) => Promise<DatasetRecordPayload | undefined>;
}

/**
 * Ensures every series in the request has a cached dataset. Remote sources are fetched on-demand.
 */
export const ensureDatasetsForRequest = async (
  request: BacktestRequest,
  deps: DatasetEnsurerDeps,
): Promise<void> => {
  for (const dataRequest of request.data) {
    await ensureDataset(dataRequest, deps);
  }
};

const ensureDataset = async (dataRequest: DataRequest, deps: DatasetEnsurerDeps): Promise<void> => {
  const filename = buildDatasetFilename(dataRequest.symbol, dataRequest.timeframe);
  const datasetPath = join(DATASETS_DIR, filename);
  let record = deps.findDatasetRecord
    ? await deps.findDatasetRecord({
        symbol: dataRequest.symbol,
        timeframe: dataRequest.timeframe,
      })
    : undefined;

  if (!dataRequest.start || !dataRequest.end) {
    throw new Error("data requests must include start and end dates.");
  }

  const filePresent = await fileExists(datasetPath);
  if (filePresent && (!record || !record.start || !record.end) && dataRequest.source === "csv") {
    const metadata = await deriveCsvMetadata(datasetPath);
    if (metadata) {
      record = {
        source: "csv",
        symbol: dataRequest.symbol,
        timeframe: dataRequest.timeframe,
        start: metadata.start,
        end: metadata.end,
        adjusted: dataRequest.adjusted ?? true,
        path: normalize(join(DATASET_RELATIVE_ROOT, filename)),
        checksum: record?.checksum ?? null,
        rows: metadata.rows,
        createdAt: record?.createdAt ?? new Date().toISOString(),
      };
      await deps.saveDataset(record);
    }
  }

  if (filePresent && coverageIncludes(record, dataRequest)) {
    return;
  }

  if (filePresent && dataRequest.source === "csv") {
    throw new Error(buildCoverageError(record, dataRequest, filename));
  }

  if (!filePresent && dataRequest.source === "csv") {
    throw new Error(
      `Dataset missing for ${dataRequest.symbol} ${dataRequest.timeframe}. ` +
        `Place ${filename} in storage/datasets or register it via /datasets.`,
    );
  }

  await fetchAndRecordDataset({
    dataRequest,
    datasetPath,
    preferredSources: derivePreferredSources(dataRequest.source),
    deps,
    filename,
  });
};

const derivePreferredSources = (source: DataRequest["source"]): RemoteSource[] => {
  if (source === "tiingo" || source === "polygon") {
    return [source];
  }
  return ["tiingo", "polygon"];
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const fetchAndRecordDataset = async ({
  dataRequest,
  datasetPath,
  preferredSources,
  deps,
  filename,
}: {
  dataRequest: DataRequest;
  datasetPath: string;
  preferredSources: RemoteSource[];
  deps: DatasetEnsurerDeps;
  filename: string;
}): Promise<void> => {
  try {
    // Clamp the request to a reasonable range to avoid API errors
    // Most APIs have limited historical data availability
    const clampedRequest = { ...dataRequest };

    const result = await fetchDatasetWithFallback({
      preferredSources,
      request: clampedRequest,
      datasetPath,
    });

    // Save whatever data we got - the engine will handle the actual date range
    // We don't throw an error if the fetched data doesn't cover the full requested range
    // because the API may have limited availability
    await deps.saveDataset({
      source: result.source,
      symbol: dataRequest.symbol,
      timeframe: dataRequest.timeframe,
      start: result.start,
      end: result.end,
      adjusted: dataRequest.adjusted ?? true,
      path: normalize(join(DATASET_RELATIVE_ROOT, filename)),
      checksum: null,
      rows: result.rows,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch ${dataRequest.symbol} ${dataRequest.timeframe} (${preferredSources.join(" → ")}): ${reason}`,
    );
  }
};

const coverageIncludes = (record: CoverageRecord | undefined, request: DataRequest): boolean => {
  if (!record?.start || !record?.end || !request.start || !request.end) {
    return false;
  }
  return coversRange(record.start, record.end, request.start, request.end);
};

const coversRange = (
  recordStart: string | null,
  recordEnd: string | null,
  start: string,
  end: string,
): boolean => {
  if (!recordStart || !recordEnd) {
    return false;
  }
  const recordStartMs = Date.parse(recordStart);
  const recordEndMs = Date.parse(recordEnd);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if ([recordStartMs, recordEndMs, startMs, endMs].some(Number.isNaN)) {
    return false;
  }
  return recordStartMs <= startMs && recordEndMs >= endMs;
};

type CoverageRecord = Pick<DatasetRecordPayload, "start" | "end"> | undefined;

const buildCoverageError = (
  record: CoverageRecord,
  request: DataRequest,
  filename: string,
  source?: string,
): string => {
  const actualStart = record?.start ?? "?";
  const actualEnd = record?.end ?? "?";
  const requestedRange = `${request.start ?? "?"} → ${request.end ?? "?"}`;
  const actualRange = `${actualStart} → ${actualEnd}`;
  const prefix =
    source && source !== "csv"
      ? `Remote dataset (${source}) for ${request.symbol} ${request.timeframe}`
      : `Dataset ${filename}`;
  return `${prefix} only covers ${actualRange}, but run requested ${requestedRange}`;
};

const deriveCsvMetadata = async (
  datasetPath: string,
): Promise<{ start: string | null; end: string | null; rows: number } | null> => {
  try {
    const content = await readFile(datasetPath, { encoding: "utf-8" });
    const metadata = extractCsvMetadata(content);
    if (!metadata.start || !metadata.end || metadata.rows === 0) {
      return null;
    }
    return metadata;
  } catch {
    return null;
  }
};
