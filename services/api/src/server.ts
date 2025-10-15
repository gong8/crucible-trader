import Fastify, { type FastifyInstance } from "fastify";

import type { BacktestRequest, BacktestResult } from "@crucible-trader/sdk";

import { registerRunsRoutes } from "./routes/runs.js";
import { enqueue, onJob, type QueueJob } from "./queue.js";

type RunStore = Map<string, BacktestResult>;

/**
 * Creates the Fastify server and wires routes with in-memory dependencies.
 */
export const createFastifyServer = (): FastifyInstance => {
  const app = Fastify({
    logger: false,
  });

  const runStore: RunStore = new Map();
  const requestStore: Map<string, BacktestRequest> = new Map();

  const saveResult = (result: BacktestResult): void => {
    runStore.set(result.runId, result);
  };

  const getResult = (runId: string): BacktestResult | undefined => {
    return runStore.get(runId);
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
  });

  onJob((job: QueueJob) => {
    requestStore.set(job.runId, job.request);
    // TODO[phase-0-next]: dispatch job to backtest worker and persist results.
  });

  // TODO[phase-0-next]: persist runStore and requestStore to SQLite runs table.

  return app;
};
