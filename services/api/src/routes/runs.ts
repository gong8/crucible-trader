import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  BacktestRequestSchema,
  assertValid,
  type BacktestRequest,
  type BacktestResult,
} from "@crucible-trader/sdk";

import type { QueueJob } from "../queue.js";

interface RunsRouteDeps {
  readonly enqueue: (job: QueueJob) => void;
  readonly saveResult: (result: BacktestResult) => void;
  readonly getResult: (runId: string) => BacktestResult | undefined;
  readonly generateRunId: (request: BacktestRequest) => string;
}

interface RunParams {
  readonly id: string;
}

interface RunCreatedResponse {
  readonly runId: string;
}

export const registerRunsRoutes = (app: FastifyInstance, deps: RunsRouteDeps): void => {
  app.post(
    "/api/runs",
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const payload = assertValid(BacktestRequestSchema, request.body, "BacktestRequest");

      const runId = deps.generateRunId(payload);
      const job: QueueJob = {
        runId,
        request: payload,
      };

      deps.enqueue(job);
      deps.saveResult(createStubResult(runId, payload));

      const response: RunCreatedResponse = { runId };
      return reply.code(201).send(response);
    },
  );

  app.get(
    "/api/runs/:id",
    async (
      request: FastifyRequest<{ Params: RunParams }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const runId = request.params.id;
      const result = deps.getResult(runId);
      if (!result) {
        return reply.code(404).send({ message: "Run not found" });
      }

      return reply.send(result);
    },
  );
};

const createStubResult = (runId: string, request: BacktestRequest): BacktestResult => {
  const basePath = `storage/runs/${runId}`;
  return {
    runId,
    summary: {
      sharpe: 0,
      max_dd: 0,
      cagr: 0,
    },
    artifacts: {
      equityParquet: `${basePath}/equity.parquet`,
      tradesParquet: `${basePath}/trades.parquet`,
      barsParquet: `${basePath}/bars.parquet`,
      reportMd: `${basePath}/report.md`,
    },
    diagnostics: {
      note: "Phase 0 stub result. TODO[phase-0-next]: replace with worker-produced output.",
      strategy: request.strategy.name,
    },
  };
};
