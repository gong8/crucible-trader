import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  BacktestRequestSchema,
  assertValid,
  type BacktestRequest,
  type BacktestResult,
  type RiskProfile,
} from "@crucible-trader/sdk";
import { createLogger } from "@crucible-trader/logger";
import { createRequire } from "node:module";
import type { JobQueue } from "../queue.js";
import { ensureDatasetsForRequest } from "./dataset-ensurer.js";
import type { RunRecord } from "../db/index.js";

const require = createRequire(import.meta.url);
const { ParquetReader } = require("parquetjs/parquet.js");

interface RunsRouteDeps {
  readonly saveResult: (result: BacktestResult) => Promise<void>;
  readonly getResult: (runId: string) => BacktestResult | undefined;
  readonly getRunRecord: (runId: string) => Promise<RunRecord | undefined>;
  readonly generateRunId: (request: BacktestRequest) => string;
  readonly listRuns: () => Promise<RunSummary[]>;
  readonly markRunQueued: (summary: RunSummary, request: BacktestRequest) => Promise<void>;
  readonly markRunCompleted: (runId: string) => Promise<void>;
  readonly resetRuns: () => Promise<void>;
  readonly getRiskProfile: (profileId: string) => Promise<RiskProfile | undefined>;
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
  readonly findDatasetRecord?: (args: { symbol: string; timeframe: string }) => Promise<
    | {
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
    | undefined
  >;
  readonly queue: JobQueue;
}

interface RunParams {
  readonly id: string;
}

interface RunCreatedResponse {
  readonly runId: string;
}

export interface RunSummary {
  readonly runId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly name?: string;
  readonly summary?: Record<string, number>;
  readonly strategy?: string;
  readonly symbol?: string;
}

interface ArtifactParams {
  readonly id: string;
  readonly artifact: "equity" | "trades" | "bars" | "report";
}
interface BarsParams {
  readonly id: string;
}

const ROUTES_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(ROUTES_DIR, "..", "..", "..", "..");
const RUNS_ROOT = join(REPO_ROOT, "storage", "runs");
const logger = createLogger("services/api");

export const registerRunsRoutes = (app: FastifyInstance, deps: RunsRouteDeps): void => {
  app.get("/api/runs", async (_request, reply) => {
    const [dbRuns, manifestRuns] = await Promise.all([deps.listRuns(), listManifestSummaries()]);

    const dbIndex = new Map(dbRuns.map((run) => [run.runId, run]));
    const updates: Promise<void>[] = [];
    for (const manifestRun of manifestRuns) {
      const existing = dbIndex.get(manifestRun.runId);
      if (existing && existing.status !== "completed") {
        updates.push(deps.markRunCompleted(manifestRun.runId));
      }
    }
    if (updates.length > 0) {
      await Promise.all(updates);
    }

    const runs = mergeRunSummaries(dbRuns, manifestRuns);
    return reply.send(runs);
  });

  app.post("/api/runs/reset", async (request, reply) => {
    console.log("[API] Reset runs endpoint called");
    try {
      console.log("[API] Calling deps.resetRuns()...");
      await deps.resetRuns();
      console.log("[API] deps.resetRuns() completed");

      console.log("[API] Calling resetRunStorage()...");
      await resetRunStorage();
      console.log("[API] resetRunStorage() completed");

      console.log("[API] Reset successful, returning 204");
      return reply.code(204).send();
    } catch (error) {
      console.error("[API] Reset failed with error:", error);
      request.log.error({ err: error }, "failed to reset runs");
      return reply.code(500).send({ message: "Run reset failed" });
    }
  });

  app.post(
    "/api/runs",
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      let payload: BacktestRequest;
      try {
        payload = assertValid(BacktestRequestSchema, request.body, "BacktestRequest");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request format";
        request.log.error({ err: error, body: request.body }, "Request validation failed");
        return reply.code(400).send({ message });
      }

      const runId = deps.generateRunId(payload);
      const queuedSummary: RunSummary = {
        runId,
        status: "queued",
        createdAt: new Date().toISOString(),
        name: payload.runName,
      };

      let riskProfile: RiskProfile | undefined;
      if (payload.riskProfileId) {
        riskProfile = await deps.getRiskProfile(payload.riskProfileId);
        if (!riskProfile) {
          return reply.code(400).send({ message: `Unknown risk profile ${payload.riskProfileId}` });
        }
      }

      try {
        await ensureDatasetsForRequest(payload, {
          saveDataset: deps.saveDataset,
          findDatasetRecord: deps.findDatasetRecord,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to prepare datasets";
        return reply.code(400).send({ message });
      }

      await deps.markRunQueued(queuedSummary, payload);

      try {
        await deps.queue.enqueue({
          runId,
          request: payload,
        });
        const response: RunCreatedResponse = { runId };
        return reply.code(201).send(response);
      } catch (error) {
        request.log.error({ err: error, runId }, "failed to enqueue run");
        return reply.code(500).send({ message: "failed to enqueue run" });
      }
    },
  );

  app.get(
    "/api/runs/:id",
    async (
      request: FastifyRequest<{ Params: RunParams }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const runId = request.params.id;

      // Check database for run status first
      const runRecord = await deps.getRunRecord(runId);
      if (!runRecord) {
        return reply.code(404).send({ message: "Run not found" });
      }

      // If run failed, return error details
      if (runRecord.status === "failed") {
        return reply.code(400).send({
          message: runRecord.errorMessage || "Backtest execution failed",
          status: "failed",
          runId: runRecord.runId,
        });
      }

      // Otherwise, try to get the result
      let result = deps.getResult(runId);
      const manifestResult = await loadManifestResult(runId);

      if (manifestResult) {
        await deps.saveResult(manifestResult);
        await deps.markRunCompleted(runId);
        result = manifestResult;
      }

      if (!result) {
        return reply.code(404).send({ message: "Run not found" });
      }

      let requestPayload: BacktestRequest | undefined;
      try {
        requestPayload = JSON.parse(runRecord.requestJson) as BacktestRequest;
      } catch {
        requestPayload = undefined;
      }

      return reply.send({
        ...result,
        request: requestPayload,
      });
    },
  );

  app.get(
    "/api/runs/:id/artifacts/:artifact",
    async (
      request: FastifyRequest<{ Params: ArtifactParams }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const { id, artifact } = request.params;
      const result = deps.getResult(id);
      if (!result) {
        return reply.code(404).send({ message: "Run not found" });
      }

      const relativePath = resolveArtifactPath(result, artifact);
      if (!relativePath) {
        return reply.code(404).send({ message: "Artifact not found" });
      }

      try {
        const absolutePath = normalize(join(REPO_ROOT, relativePath));
        const buffer = await readFile(absolutePath);
        if (artifact === "report") {
          reply.header("content-type", "text/markdown; charset=utf-8");
        } else {
          reply.header("content-type", "application/octet-stream");
        }
        return reply.send(buffer);
      } catch (error) {
        request.log.error({ err: error, runId: id, artifact }, "failed to read artifact");
        return reply.code(404).send({ message: "Artifact unavailable" });
      }
    },
  );

  app.get(
    "/api/runs/:id/bars",
    async (
      request: FastifyRequest<{ Params: BarsParams }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const runId = request.params.id;
      const result = await getResultWithFallback(runId, deps);
      if (!result) {
        return reply.code(404).send({ message: "Run not found" });
      }
      const barsPath = resolveArtifactPath(result, "bars");
      if (!barsPath) {
        return reply.code(404).send({ message: "Bars artifact missing" });
      }
      try {
        const parquetPath = normalize(join(REPO_ROOT, barsPath));
        const rows = await readParquetRows(parquetPath, [
          "time",
          "open",
          "high",
          "low",
          "close",
          "volume",
        ]);
        return reply.send(
          rows.map((row) => ({
            time: String(row.time ?? ""),
            open: Number(row.open ?? 0),
            high: Number(row.high ?? 0),
            low: Number(row.low ?? 0),
            close: Number(row.close ?? 0),
            volume: Number(row.volume ?? 0),
          })),
        );
      } catch (error) {
        request.log.error({ err: error, runId }, "failed to read bars");
        return reply.code(500).send({ message: "Failed to load bars" });
      }
    },
  );

  app.get(
    "/api/runs/:id/equity",
    async (
      request: FastifyRequest<{ Params: RunParams }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const result = await getResultWithFallback(request.params.id, deps);
      if (!result) {
        return reply.code(404).send({ message: "Run not found" });
      }

      const relative = resolveArtifactPath(result, "equity");
      if (!relative) {
        return reply.code(404).send({ message: "Artifact not found" });
      }

      try {
        const absolute = normalize(join(REPO_ROOT, relative));
        const rows = await readParquetRows(absolute, ["time", "equity"]);
        return reply.send(
          rows.map((row) => ({
            time: String(row.time ?? ""),
            equity: Number(row.equity ?? 0),
          })),
        );
      } catch (error) {
        request.log.error({ err: error, runId: request.params.id, artifact: "equity" });
        return reply.code(500).send({ message: "Failed to load equity data" });
      }
    },
  );

  app.get(
    "/api/runs/:id/trades",
    async (
      request: FastifyRequest<{ Params: RunParams }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const result = await getResultWithFallback(request.params.id, deps);
      if (!result) {
        return reply.code(404).send({ message: "Run not found" });
      }
      const relative = resolveArtifactPath(result, "trades");
      if (!relative) {
        return reply.code(404).send({ message: "Artifact not found" });
      }
      try {
        const absolute = normalize(join(REPO_ROOT, relative));
        const rows = await readParquetRows(absolute, ["time", "side", "price", "qty", "pnl"]);
        return reply.send(
          rows.map((row) => ({
            time: String(row.time ?? ""),
            side: String(row.side ?? "buy"),
            price: Number(row.price ?? 0),
            qty: Number(row.qty ?? 0),
            pnl: Number(row.pnl ?? 0),
          })),
        );
      } catch (error) {
        request.log.error({ err: error, runId: request.params.id, artifact: "trades" });
        return reply.code(500).send({ message: "Failed to load trade data" });
      }
    },
  );
};

const resolveArtifactPath = (
  result: BacktestResult,
  artifact: ArtifactParams["artifact"],
): string | null => {
  switch (artifact) {
    case "equity":
      return result.artifacts.equityParquet;
    case "trades":
      return result.artifacts.tradesParquet;
    case "bars":
      return result.artifacts.barsParquet;
    case "report":
      return result.artifacts.reportMd ?? null;
    default:
      return null;
  }
};

const loadManifest = async (runId: string): Promise<ManifestShape | null> => {
  try {
    const manifestPath = normalize(join(RUNS_ROOT, runId, "manifest.json"));
    const buffer = await readFile(manifestPath, { encoding: "utf-8" });
    return JSON.parse(buffer) as ManifestShape;
  } catch {
    return null;
  }
};

const loadManifestResult = async (runId: string): Promise<BacktestResult | null> => {
  const manifest = await loadManifest(runId);
  if (!manifest) {
    return null;
  }

  return {
    runId: manifest.runId,
    summary: manifest.summary ?? {},
    artifacts: manifest.artifacts,
    diagnostics: {
      engineVersion: manifest.engine?.version,
      seed: manifest.engine?.seed,
    },
  };
};

interface ManifestMetadata {
  readonly name?: string;
  readonly createdAt?: string;
  readonly status?: string;
}

const listManifestSummaries = async (): Promise<RunSummary[]> => {
  try {
    const entries = await readdir(RUNS_ROOT, { withFileTypes: true });
    const summaries: RunSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifest = await loadManifest(entry.name);
      if (!manifest) {
        continue;
      }
      const createdAt = manifest.metadata?.createdAt ?? (await readManifestTimestamp(entry.name));
      summaries.push({
        runId: entry.name,
        status: manifest.metadata?.status ?? "completed",
        createdAt,
        name: manifest.metadata?.name ?? undefined,
        summary: manifest.summary,
      });
    }
    return summaries;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return [];
    }
    logger.error("Failed to list run manifests", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
};

const readManifestTimestamp = async (runId: string): Promise<string> => {
  try {
    const stats = await stat(join(RUNS_ROOT, runId, "manifest.json"));
    return stats.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
};

const mergeRunSummaries = (dbRuns: RunSummary[], manifestRuns: RunSummary[]): RunSummary[] => {
  const merged = new Map<string, RunSummary>();

  for (const run of dbRuns) {
    merged.set(run.runId, { ...run });
  }

  for (const manifest of manifestRuns) {
    const existing = merged.get(manifest.runId);
    if (existing) {
      merged.set(manifest.runId, {
        runId: manifest.runId,
        status: manifest.status ?? existing.status,
        createdAt: manifest.createdAt ?? existing.createdAt,
        name: manifest.name ?? existing.name,
        summary: manifest.summary ?? existing.summary,
        strategy: manifest.strategy ?? existing.strategy,
        symbol: manifest.symbol ?? existing.symbol,
      });
    } else {
      merged.set(manifest.runId, manifest);
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = Date.parse(a.createdAt ?? "") || 0;
    const bTime = Date.parse(b.createdAt ?? "") || 0;
    return bTime - aTime;
  });
};

const resetRunStorage = async (): Promise<void> => {
  await rm(RUNS_ROOT, { recursive: true, force: true });
  await mkdir(RUNS_ROOT, { recursive: true });
};

interface ManifestShape {
  readonly runId: string;
  readonly summary?: Record<string, number>;
  readonly artifacts: BacktestResult["artifacts"];
  readonly engine?: {
    readonly version?: string;
    readonly seed?: number;
  };
  readonly metadata?: ManifestMetadata;
}

async function getResultWithFallback(
  runId: string,
  deps: RunsRouteDeps,
): Promise<BacktestResult | null> {
  const fromStore = deps.getResult(runId);
  if (fromStore) {
    return fromStore;
  }
  return loadManifestResult(runId);
}

async function readParquetRows(
  absolutePath: string,
  columns: string[],
): Promise<Record<string, unknown>[]> {
  const reader = await ParquetReader.openFile(absolutePath);
  try {
    const cursor = reader.getCursor(columns);
    const rows: Record<string, unknown>[] = [];
    let row: Record<string, unknown> | null;
    // eslint-disable-next-line no-cond-assign
    while ((row = await cursor.next())) {
      rows.push(row);
    }
    return rows;
  } finally {
    await reader.close();
  }
}
