import { readFile, stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { DatasetRecord } from "../db/index.js";

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
}

interface DatasetFetchBody {
  readonly source: "csv";
  readonly symbol: string;
  readonly timeframe: string;
  readonly adjusted?: boolean;
}

const ROUTES_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(ROUTES_DIR, "..", "..", "..", "..");
const DATASETS_DIR = join(REPO_ROOT, "storage", "datasets");

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
      const filename = `${slugify(payload.symbol)}_${slugify(payload.timeframe)}.csv`;
      const datasetPath = join(DATASETS_DIR, filename);

      try {
        await stat(datasetPath);
      } catch {
        return reply.code(404).send({ message: `Dataset ${filename} not found` });
      }

      try {
        const content = await readFile(datasetPath, { encoding: "utf-8" });
        const metadata = extractCsvMetadata(content);
        const relativePath = normalize(join("storage", "datasets", filename));
        await deps.saveDataset({
          source: payload.source,
          symbol: payload.symbol,
          timeframe: payload.timeframe,
          start: metadata.start,
          end: metadata.end,
          adjusted: payload.adjusted ?? false,
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
        });
      } catch (error) {
        request.log.error({ err: error }, "dataset fetch failed");
        return reply.code(500).send({ message: "Dataset fetch failed" });
      }
    },
  );
};

const validateFetchPayload = (body: DatasetFetchBody | undefined): DatasetFetchBody => {
  if (!body || typeof body !== "object") {
    throw new Error("invalid payload");
  }
  if (body.source !== "csv") {
    throw new Error("only csv source supported in phase 0");
  }
  if (typeof body.symbol !== "string" || body.symbol.trim().length === 0) {
    throw new Error("symbol is required");
  }
  if (typeof body.timeframe !== "string" || body.timeframe.trim().length === 0) {
    throw new Error("timeframe is required");
  }
  return {
    source: "csv",
    symbol: body.symbol.trim(),
    timeframe: body.timeframe.trim(),
    adjusted: body.adjusted ?? true,
  };
};

const extractCsvMetadata = (
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
  return {
    start: first,
    end: last,
    rows: rows.length,
  };
};

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
};
