import { join, normalize } from "node:path";
import { stat } from "node:fs/promises";

import type { BacktestRequest, DataRequest } from "@crucible-trader/sdk";

import {
  DATASET_RELATIVE_ROOT,
  DATASETS_DIR,
  buildDatasetFilename,
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

  if (await fileExists(datasetPath)) {
    return;
  }

  if (!dataRequest.start || !dataRequest.end) {
    throw new Error("data requests must include start and end dates.");
  }

  if (dataRequest.source === "csv") {
    throw new Error(
      `Dataset missing for ${dataRequest.symbol} ${dataRequest.timeframe}. ` +
        `Place ${filename} in storage/datasets or register it via /datasets.`,
    );
  }

  const preferredSources = derivePreferredSources(dataRequest.source);
  try {
    const result = await fetchDatasetWithFallback({
      preferredSources,
      request: dataRequest,
      datasetPath,
    });

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
