import Fastify, { type FastifyInstance } from "fastify";

import type { BacktestRequest, BacktestResult, RiskProfile } from "@crucible-trader/sdk";

import { createApiDatabase, type ApiDatabase } from "./db/index.js";
import { initializeQueue, JobQueue } from "./queue.js";
import { registerDatasetRoutes } from "./routes/datasets.js";
import { registerRiskProfileRoutes } from "./routes/risk-profiles.js";
import { registerRunsRoutes, type RunSummary } from "./routes/runs.js";
import { registerStatsRoutes } from "./routes/stats.js";

type ResultCache = Map<string, BacktestResult>;

export interface CreateFastifyServerOptions {
  readonly database?: ApiDatabase;
  readonly databaseFilename?: string;
  readonly queue?: JobQueue;
}

/**
 * Creates the Fastify server and wires routes with SQLite-backed dependencies.
 */
export const createFastifyServer = async (
  options: CreateFastifyServerOptions = {},
): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: false,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.method !== "OPTIONS") {
      reply.header("access-control-allow-origin", request.headers.origin ?? "*");
      reply.header("access-control-allow-credentials", "true");
    }
    return payload;
  });

  app.options("/api/*", async (request, reply) => {
    reply
      .header("access-control-allow-origin", request.headers.origin ?? "*")
      .header("access-control-allow-methods", "GET,POST,DELETE,OPTIONS")
      .header(
        "access-control-allow-headers",
        request.headers["access-control-request-headers"] ?? "content-type",
      )
      .header("access-control-allow-credentials", "true")
      .code(204)
      .send();
  });

  const databaseProvided = Boolean(options.database);
  const database =
    options.database ??
    (await createApiDatabase({
      filename: options.databaseFilename,
    }));
  const queue = options.queue ?? initializeQueue(database);
  const resultCache: ResultCache = new Map();

  const saveResult = async (result: BacktestResult): Promise<void> => {
    resultCache.set(result.runId, result);
    await database.saveRunResult(result);
  };

  const getResult = (runId: string): BacktestResult | undefined => {
    return resultCache.get(runId);
  };

  const getRunRecord = async (runId: string) => {
    return database.getRun(runId);
  };

  const listRuns = async (): Promise<RunSummary[]> => {
    const rows = await database.listRuns();
    return rows.map((row) => {
      let summary: Record<string, number> | undefined;
      if (row.summaryJson) {
        try {
          summary = JSON.parse(row.summaryJson) as Record<string, number>;
        } catch {
          summary = undefined;
        }
      }
      return {
        runId: row.runId,
        name: row.name ?? undefined,
        status: row.status,
        createdAt: row.createdAt,
        summary,
      };
    });
  };

  const markRunQueued = async (summary: RunSummary, request: BacktestRequest): Promise<void> => {
    await database.insertRun({
      runId: summary.runId,
      name: request.runName,
      createdAt: summary.createdAt,
      status: summary.status,
      requestJson: JSON.stringify(request),
    });
  };

  const markRunCompleted = async (runId: string): Promise<void> => {
    await database.updateRunStatus(runId, "completed");
  };

  const resetRuns = async (): Promise<void> => {
    resultCache.clear();
    await database.reset();
  };

  const generateRunId = (request: BacktestRequest): string => {
    const base = request.runName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const slug = base.replace(/^-+|-+$/g, "");
    const suffix = Date.now().toString(36);
    return slug.length > 0 ? `${slug}-${suffix}` : `run-${suffix}`;
  };

  const getRiskProfile = async (profileId: string): Promise<RiskProfile | undefined> => {
    return database.getRiskProfileById(profileId);
  };

  registerRunsRoutes(app, {
    saveResult,
    getResult,
    getRunRecord,
    generateRunId,
    listRuns,
    markRunQueued,
    markRunCompleted,
    resetRuns,
    getRiskProfile,
    saveDataset: (record) => database.upsertDataset(record),
    findDatasetRecord: (args) => database.findDataset(args),
    queue,
  });

  registerDatasetRoutes(app, {
    listDatasets: () => database.listDatasets(),
    saveDataset: (record) => database.upsertDataset(record),
    deleteDatasetRecord: (args) => database.deleteDatasetRecord(args),
  });

  registerRiskProfileRoutes(app, {
    listRiskProfiles: () => database.listRiskProfiles(),
    saveRiskProfile: (profile) => database.upsertRiskProfile(profile),
  });

  registerStatsRoutes(app, {
    insertStatTest: (args) => database.insertStatTest(args),
    listStatTests: (runId) => database.listStatTests(runId),
    getStatTest: (id) => database.getStatTest(id),
  });

  app.addHook("onClose", async () => {
    if (!databaseProvided) {
      await database.close();
    }
  });

  return app;
};
