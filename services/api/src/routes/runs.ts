import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  BacktestRequestSchema,
  assertValid,
  type BacktestRequest,
  type BacktestResult,
} from "@crucible-trader/sdk";
import { runBacktest } from "@crucible-trader/engine";
import { createLogger } from "@crucible-trader/logger";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ParquetReader } = require("parquetjs/parquet.js");

interface RunsRouteDeps {
  readonly saveResult: (result: BacktestResult) => void;
  readonly getResult: (runId: string) => BacktestResult | undefined;
  readonly generateRunId: (request: BacktestRequest) => string;
  readonly listRuns: () => RunSummary[];
  readonly markRunQueued: (summary: RunSummary) => void;
  readonly markRunCompleted: (runId: string) => void;
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
}

interface ArtifactParams {
  readonly id: string;
  readonly artifact: "equity" | "trades" | "bars";
}

const ROUTES_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(ROUTES_DIR, "..", "..", "..", "..");
const RUNS_ROOT = join(REPO_ROOT, "storage", "runs");
const logger = createLogger("services/api");

export const registerRunsRoutes = (app: FastifyInstance, deps: RunsRouteDeps): void => {
  app.get("/api/runs", async (_request, reply) => {
    const runs = await Promise.all(
      deps.listRuns().map(async (run) => {
        const manifest = await loadManifest(run.runId);
        if (manifest) {
          deps.markRunCompleted(run.runId);
          return { ...run, status: "completed" } satisfies RunSummary;
        }
        return run;
      }),
    );
    return reply.send(runs);
  });

  app.post(
    "/api/runs",
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const payload = assertValid(BacktestRequestSchema, request.body, "BacktestRequest");

      const runId = deps.generateRunId(payload);
      deps.markRunQueued({
        runId,
        status: "queued",
        createdAt: new Date().toISOString(),
      });

      try {
        const result = await runBacktest(payload);
        const finalResult = await normalizeResultRunId(result, runId);
        await writeManifest(finalResult);
        deps.saveResult(finalResult);
        deps.markRunCompleted(runId);
        const response: RunCreatedResponse = { runId };
        return reply.code(201).send(response);
      } catch (error) {
        request.log.error({ err: error, runId }, "run backtest failed");
        return reply.code(500).send({ message: "run failed" });
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
      let result = deps.getResult(runId);
      const manifestResult = await loadManifestResult(runId);

      if (manifestResult) {
        deps.saveResult(manifestResult);
        deps.markRunCompleted(runId);
        result = manifestResult;
      }

      if (!result) {
        return reply.code(404).send({ message: "Run not found" });
      }

      return reply.send(result);
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
        reply.header("content-type", "application/octet-stream");
        return reply.send(buffer);
      } catch (error) {
        request.log.error({ err: error, runId: id, artifact }, "failed to read artifact");
        return reply.code(404).send({ message: "Artifact unavailable" });
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

interface ManifestShape {
  readonly runId: string;
  readonly summary?: Record<string, number>;
  readonly artifacts: BacktestResult["artifacts"];
  readonly engine?: {
    readonly version?: string;
    readonly seed?: number;
  };
}

const writeManifest = async (result: BacktestResult): Promise<void> => {
  const runDir = join(RUNS_ROOT, result.runId);
  await mkdir(runDir, { recursive: true });
  const manifest: ManifestShape = {
    runId: result.runId,
    summary: result.summary,
    artifacts: result.artifacts,
    engine: {
      version: "0.0.1",
      seed: (result.diagnostics?.seed as number) ?? 42,
    },
  };
  const manifestPath = join(runDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf-8" });
};

const normalizeResultRunId = async (
  result: BacktestResult,
  desiredRunId: string,
): Promise<BacktestResult> => {
  if (result.runId === desiredRunId) {
    return result;
  }

  const oldDir = join(RUNS_ROOT, result.runId);
  const newDir = join(RUNS_ROOT, desiredRunId);

  try {
    await rename(oldDir, newDir);
  } catch (error) {
    // If rename fails (e.g., oldDir missing), log and continue with newDir
    logger.error("Failed to rename run directory", {
      oldDir,
      newDir,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const remapPath = (path: string): string => {
    return path.replace(result.runId, desiredRunId);
  };

  return {
    ...result,
    runId: desiredRunId,
    artifacts: {
      ...result.artifacts,
      equityParquet: remapPath(result.artifacts.equityParquet),
      tradesParquet: remapPath(result.artifacts.tradesParquet),
      barsParquet: remapPath(result.artifacts.barsParquet),
    },
  };
};

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
