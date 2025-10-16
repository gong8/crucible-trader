import Fastify, { type FastifyInstance } from "fastify";

import type { BacktestRequest, BacktestResult } from "@crucible-trader/sdk";

import { createApiDatabase } from "./db/index.js";
import { registerRunsRoutes, type RunSummary } from "./routes/runs.js";

type ResultCache = Map<string, BacktestResult>;

/**
 * Creates the Fastify server and wires routes with SQLite-backed dependencies.
 */
export const createFastifyServer = async (): Promise<FastifyInstance> => {
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
      .header("access-control-allow-methods", "GET,POST,OPTIONS")
      .header(
        "access-control-allow-headers",
        request.headers["access-control-request-headers"] ?? "content-type",
      )
      .header("access-control-allow-credentials", "true")
      .code(204)
      .send();
  });

  const database = await createApiDatabase();
  const resultCache: ResultCache = new Map();

  const saveResult = async (result: BacktestResult): Promise<void> => {
    resultCache.set(result.runId, result);
    await database.saveRunResult(result);
  };

  const getResult = (runId: string): BacktestResult | undefined => {
    return resultCache.get(runId);
  };

  const listRuns = async (): Promise<RunSummary[]> => {
    const rows = await database.listRuns();
    return rows.map((row) => ({
      runId: row.runId,
      name: row.name ?? undefined,
      status: row.status,
      createdAt: row.createdAt,
    }));
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

  const generateRunId = (request: BacktestRequest): string => {
    const base = request.runName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const slug = base.replace(/^-+|-+$/g, "");
    const suffix = Date.now().toString(36);
    return slug.length > 0 ? `${slug}-${suffix}` : `run-${suffix}`;
  };

  registerRunsRoutes(app, {
    saveResult,
    getResult,
    generateRunId,
    listRuns,
    markRunQueued,
    markRunCompleted,
  });

  app.addHook("onClose", async () => {
    await database.close();
  });

  return app;
};
