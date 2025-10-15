import Fastify, { type FastifyInstance } from "fastify";

import type { BacktestRequest, BacktestResult } from "@crucible-trader/sdk";

import { registerRunsRoutes, type RunSummary } from "./routes/runs.js";
import { enqueue, onJob, type QueueJob } from "./queue.js";

type RunStore = Map<string, BacktestResult>;

/**
 * Creates the Fastify server and wires routes with in-memory dependencies.
 */
export const createFastifyServer = (): FastifyInstance => {
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

  const runStore: RunStore = new Map();
  const runSummaries: Map<string, RunSummary> = new Map();
  const requestStore: Map<string, BacktestRequest> = new Map();

  const saveResult = (result: BacktestResult): void => {
    runStore.set(result.runId, result);
    const existing = runSummaries.get(result.runId);
    runSummaries.set(result.runId, {
      runId: result.runId,
      status: "completed",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
  };

  const getResult = (runId: string): BacktestResult | undefined => {
    return runStore.get(runId);
  };

  const listRuns = (): RunSummary[] => {
    return Array.from(runSummaries.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
  };

  const markRunQueued = (summary: RunSummary): void => {
    runSummaries.set(summary.runId, summary);
  };

  const generateRunId = (request: BacktestRequest): string => {
    const base = request.runName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const slug = base.replace(/^-+|-+$/g, "");
    const suffix = Date.now().toString(36);
    return slug.length > 0 ? `${slug}-${suffix}` : `run-${suffix}`;
  };

  registerRunsRoutes(app, {
    enqueue,
    saveResult,
    getResult,
    generateRunId,
    listRuns,
    markRunQueued,
  });

  onJob((job: QueueJob) => {
    requestStore.set(job.runId, job.request);
    // TODO[phase-0-next]: dispatch job to backtest worker and persist results.
  });

  // TODO[phase-0-next]: persist runStore and requestStore to SQLite runs table.

  return app;
};
