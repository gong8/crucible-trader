import { access, readFile, rm, stat } from "node:fs/promises";
import { join, normalize } from "node:path";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { DatasetRecord } from "../db/index.js";
import type { DataRequest, DataSource, Timeframe } from "@crucible-trader/sdk";
import {
  DATASET_RELATIVE_ROOT,
  DATASETS_DIR,
  buildDatasetFilename,
  extractCsvMetadata,
  fetchDatasetWithFallback,
  type RemoteSource,
} from "./data-fetchers.js";

interface DatasetRouteDeps {
  readonly listDatasets: () => Promise<DatasetRecord[]>;
  readonly saveDataset: (record: {
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
  }) => Promise<void>;
  readonly deleteDatasetRecord: (args: { symbol: string; timeframe: string }) => Promise<void>;
}

interface DatasetFetchBody {
  readonly source: DataSource;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly start?: string;
  readonly end?: string;
  readonly adjusted?: boolean;
}

export const registerDatasetRoutes = (app: FastifyInstance, deps: DatasetRouteDeps): void => {
  app.get("/api/datasets", async (_request, reply) => {
    const rows = await deps.listDatasets();
    return reply.send(
      rows.map((row) => ({
        id: row.id,
        source: row.source,
        symbol: row.symbol,
        timeframe: row.timeframe,
        start: row.start,
        end: row.end,
        adjusted: Boolean(row.adjusted),
        path: row.path,
        rows: row.rows ?? 0,
        createdAt: row.createdAt,
      })),
    );
  });

  app.post(
    "/api/datasets/fetch",
    async (
      request: FastifyRequest<{ Body: DatasetFetchBody }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      let payload: DatasetFetchBody;
      try {
        payload = validateFetchPayload(request.body);
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid dataset fetch payload";
        return reply.code(400).send({ message });
      }
      const filename = buildDatasetFilename(payload.symbol, payload.timeframe);
      const datasetPath = join(DATASETS_DIR, filename);
      const exists = await fileExists(datasetPath);

      if (payload.source === "csv") {
        return handleCsvDatasetRequest({
          datasetPath,
          filename,
          payload,
          deps,
          reply,
          request,
        });
      }

      if (exists) {
        let recordedSource = await findExistingDatasetSource(
          deps,
          payload.symbol,
          payload.timeframe,
        );

        // If not in database, detect actual source from cache files
        if (!recordedSource) {
          recordedSource = await detectSourceFromCache(payload.symbol, payload.timeframe);
        }

        // Fallback to requested source
        if (!recordedSource) {
          recordedSource = payload.source === "auto" ? "csv" : payload.source;
        }

        return registerExistingDataset({
          datasetPath,
          filename,
          payload,
          deps,
          reply,
          recordedSource,
          request,
        });
      }

      const preferredSources: RemoteSource[] =
        payload.source === "auto" ? ["tiingo", "polygon"] : [payload.source as RemoteSource];

      return handleRemoteDatasetRequest({
        datasetPath,
        filename,
        payload,
        deps,
        reply,
        request,
        preferredSources,
      });
    },
  );

  app.delete(
    "/api/datasets/:symbol/:timeframe",
    async (
      request: FastifyRequest<{ Params: { symbol: string; timeframe: string } }>,
      reply: FastifyReply,
    ) => {
      const { symbol, timeframe } = request.params;
      const filename = buildDatasetFilename(symbol, timeframe);
      const datasetPath = join(DATASETS_DIR, filename);
      try {
        await deps.deleteDatasetRecord({ symbol, timeframe });
        await rm(datasetPath, { force: true });
        await removeDatasetCaches(symbol, timeframe);
        return reply.code(204).send();
      } catch (error) {
        request.log.error({ err: error, symbol, timeframe }, "failed to delete dataset");
        return reply.code(500).send({ message: "Failed to delete dataset" });
      }
    },
  );
};

const SUPPORTED_SOURCES: ReadonlyArray<DataSource> = ["auto", "csv", "tiingo", "polygon"];
const SUPPORTED_TIMEFRAMES: ReadonlyArray<Timeframe> = ["1d", "1h", "15m", "1m"];

const validateFetchPayload = (body: DatasetFetchBody | undefined): DatasetFetchBody => {
  if (!body || typeof body !== "object") {
    throw new Error("invalid payload");
  }
  if (!SUPPORTED_SOURCES.includes(body.source)) {
    throw new Error("unsupported data source");
  }
  if (typeof body.symbol !== "string" || body.symbol.trim().length === 0) {
    throw new Error("symbol is required");
  }
  if (!SUPPORTED_TIMEFRAMES.includes(body.timeframe)) {
    throw new Error("invalid timeframe");
  }
  if (body.source !== "csv") {
    if (typeof body.start !== "string" || body.start.trim().length === 0) {
      throw new Error("start date is required for remote sources");
    }
    if (typeof body.end !== "string" || body.end.trim().length === 0) {
      throw new Error("end date is required for remote sources");
    }
  }
  return {
    source: body.source,
    symbol: body.symbol.trim(),
    timeframe: body.timeframe,
    start: body.start?.trim(),
    end: body.end?.trim(),
    adjusted: body.adjusted ?? true,
  };
};

const handleCsvDatasetRequest = async ({
  datasetPath,
  filename,
  payload,
  deps,
  reply,
  request,
}: {
  readonly datasetPath: string;
  readonly filename: string;
  readonly payload: DatasetFetchBody;
  readonly deps: DatasetRouteDeps;
  readonly reply: FastifyReply;
  readonly request: FastifyRequest;
}): Promise<FastifyReply> => {
  if (!(await fileExists(datasetPath))) {
    return reply.code(404).send({ message: `Dataset ${filename} not found` });
  }

  return registerExistingDataset({
    datasetPath,
    filename,
    payload,
    deps,
    reply,
    recordedSource: "csv",
    request,
  });
};

const handleRemoteDatasetRequest = async ({
  datasetPath,
  filename,
  payload,
  deps,
  reply,
  request,
  preferredSources,
}: {
  readonly datasetPath: string;
  readonly filename: string;
  readonly payload: DatasetFetchBody;
  readonly deps: DatasetRouteDeps;
  readonly reply: FastifyReply;
  readonly request: FastifyRequest;
  readonly preferredSources: ReadonlyArray<RemoteSource>;
}): Promise<FastifyReply> => {
  const dataRequest: DataRequest = {
    source: payload.source,
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    start: payload.start as string,
    end: payload.end as string,
    adjusted: payload.adjusted,
  };

  try {
    const result = await fetchDatasetWithFallback({
      preferredSources,
      request: dataRequest,
      datasetPath,
    });

    const relativePath = normalize(join(DATASET_RELATIVE_ROOT, filename));
    await deps.saveDataset({
      source: result.source,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      start: result.start,
      end: result.end,
      adjusted: payload.adjusted ?? true,
      path: relativePath,
      checksum: null,
      rows: result.rows,
      createdAt: new Date().toISOString(),
    });

    return reply.send({
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      rows: result.rows,
      start: result.start,
      end: result.end,
      path: relativePath,
      source: result.source,
    });
  } catch (error) {
    request.log.error({ err: error }, "remote dataset fetch failed");
    const message = error instanceof Error ? error.message : "Remote dataset fetch failed";
    return reply.code(500).send({ message });
  }
};

const registerExistingDataset = async ({
  datasetPath,
  filename,
  payload,
  deps,
  reply,
  recordedSource,
  request,
}: {
  readonly datasetPath: string;
  readonly filename: string;
  readonly payload: DatasetFetchBody;
  readonly deps: DatasetRouteDeps;
  readonly reply: FastifyReply;
  readonly recordedSource: string;
  readonly request: FastifyRequest;
}): Promise<FastifyReply> => {
  try {
    const content = await readFile(datasetPath, { encoding: "utf-8" });
    const metadata = extractCsvMetadata(content);
    const relativePath = normalize(join(DATASET_RELATIVE_ROOT, filename));
    await deps.saveDataset({
      source: recordedSource,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      start: metadata.start,
      end: metadata.end,
      adjusted: payload.adjusted ?? true,
      path: relativePath,
      checksum: null,
      rows: metadata.rows,
      createdAt: new Date().toISOString(),
    });
    return reply.send({
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      rows: metadata.rows,
      start: metadata.start,
      end: metadata.end,
      path: relativePath,
      source: recordedSource,
    });
  } catch (error) {
    reply.log.error({ err: error }, "failed to register existing dataset");
    if (payload.source !== "csv") {
      await rm(datasetPath, { force: true });
      await removeDatasetCaches(payload.symbol, payload.timeframe);
      const preferredSources: ReadonlyArray<RemoteSource> =
        payload.source === "auto" ? ["tiingo", "polygon"] : [payload.source as RemoteSource];
      return handleRemoteDatasetRequest({
        datasetPath,
        filename,
        payload,
        deps,
        reply,
        request,
        preferredSources,
      });
    }
    return reply.code(500).send({ message: "Dataset registration failed" });
  }
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const findExistingDatasetSource = async (
  deps: DatasetRouteDeps,
  symbol: string,
  timeframe: string,
): Promise<string | null> => {
  const rows = await deps.listDatasets();
  const match = rows.find((row) => row.symbol === symbol && row.timeframe === timeframe);
  return match?.source ?? null;
};

/**
 * Detect the actual source of a dataset by checking which cache files exist
 */
const detectSourceFromCache = async (
  symbol: string,
  timeframe: string,
): Promise<"tiingo" | "polygon" | null> => {
  const cacheDir = join(DATASETS_DIR, ".cache");
  const slug = buildDatasetFilename(symbol, timeframe).replace(/\.csv$/u, "");

  // Check for Tiingo cache files
  const tiingoAdjusted = join(cacheDir, "tiingo", `${slug}_adj.json`);
  const tiingoRaw = join(cacheDir, "tiingo", `${slug}_raw.json`);

  try {
    await access(tiingoAdjusted);
    return "tiingo";
  } catch {
    // File doesn't exist, continue
  }

  try {
    await access(tiingoRaw);
    return "tiingo";
  } catch {
    // File doesn't exist, continue
  }

  // Check for Polygon cache files
  const polygonAdjusted = join(cacheDir, "polygon", `${slug}_adj.json`);
  const polygonRaw = join(cacheDir, "polygon", `${slug}_raw.json`);

  try {
    await access(polygonAdjusted);
    return "polygon";
  } catch {
    // File doesn't exist, continue
  }

  try {
    await access(polygonRaw);
    return "polygon";
  } catch {
    // File doesn't exist, continue
  }

  return null;
};

const removeDatasetCaches = async (symbol: string, timeframe: string): Promise<void> => {
  const cacheDir = join(DATASETS_DIR, ".cache");
  const slug = buildDatasetFilename(symbol, timeframe).replace(/\.csv$/u, "");
  await rm(join(cacheDir, `${slug}.json`), { force: true });
  await rm(join(cacheDir, "tiingo", `${slug}_adj.json`), { force: true });
  await rm(join(cacheDir, "tiingo", `${slug}_raw.json`), { force: true });
  await rm(join(cacheDir, "polygon", `${slug}_adj.json`), { force: true });
  await rm(join(cacheDir, "polygon", `${slug}_raw.json`), { force: true });
};
