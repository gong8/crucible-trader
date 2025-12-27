import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

import {
  assertValid,
  OptimizationRequestSchema,
  type OptimizationResult,
} from "@crucible-trader/sdk";
import { createLogger } from "@crucible-trader/logger";
import { expandParamGrid } from "@crucible-trader/stats";

const logger = createLogger("services/api/routes/optimize");

export interface OptimizeRouteDeps {
  readonly createOptimization: (opt: {
    optId: string;
    name: string;
    strategyName: string;
    paramGridJson: string;
    objective: string;
    constraintsJson: string | null;
    walkForwardConfigJson: string | null;
    bootstrapIterations: number | null;
    permutationIterations: number | null;
    seed: number | null;
    totalCombinations: number;
    baseRequestJson: string;
  }) => Promise<void>;
  readonly getOptimization: (optId: string) => Promise<OptimizationResult | undefined>;
  readonly listOptimizations: () => Promise<OptimizationResult[]>;
  readonly updateOptimization: (
    optId: string,
    updates: {
      status?: string;
      bestParamsJson?: string;
      bestScore?: number;
      bestRobustnessScore?: number;
      resultsJson?: string;
      walkForwardResultsJson?: string;
      completedAt?: string;
      errorMessage?: string;
    },
  ) => Promise<void>;
}

interface OptParams {
  readonly id: string;
}

/**
 * Registers optimization-related routes.
 */
export const registerOptimizeRoutes = (app: FastifyInstance, deps: OptimizeRouteDeps): void => {
  /**
   * POST /api/optimize/grid
   * Creates a new grid search optimization job.
   */
  app.post<{ Body: unknown }>("/api/optimize/grid", async (request, reply) => {
    try {
      const body = assertValid(OptimizationRequestSchema, request.body, "optimization request");

      const optId = `opt-${randomUUID()}`;
      const totalCombinations = expandParamGrid(body.paramGrid).length;

      logger.info("Creating optimization job", {
        optId,
        strategyName: body.strategy.name,
        totalCombinations,
      });

      await deps.createOptimization({
        optId,
        name: body.name,
        strategyName: body.strategy.name,
        paramGridJson: JSON.stringify(body.paramGrid),
        objective: body.objective,
        constraintsJson: body.constraints ? JSON.stringify(body.constraints) : null,
        walkForwardConfigJson: body.walkForward ? JSON.stringify(body.walkForward) : null,
        bootstrapIterations: body.bootstrapIterations ?? null,
        permutationIterations: body.permutationIterations ?? null,
        seed: body.seed ?? null,
        totalCombinations,
        baseRequestJson: JSON.stringify(body.baseRequest),
      });

      logger.info("Optimization job created", { optId });

      return reply.code(201).send({ optId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to create optimization", { error: errorMessage });
      return reply.code(400).send({ error: errorMessage });
    }
  });

  /**
   * GET /api/optimize/:id
   * Retrieves an optimization job by ID.
   */
  app.get<{ Params: OptParams }>("/api/optimize/:id", async (request, reply) => {
    try {
      const { id } = request.params;
      const opt = await deps.getOptimization(id);

      if (!opt) {
        return reply.code(404).send({ error: "Optimization not found" });
      }

      return reply.send(opt);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to fetch optimization", { error: errorMessage });
      return reply.code(500).send({ error: errorMessage });
    }
  });

  /**
   * GET /api/optimize
   * Lists all optimization jobs.
   */
  app.get("/api/optimize", async (_request, reply) => {
    try {
      const opts = await deps.listOptimizations();
      return reply.send({ optimizations: opts });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to list optimizations", { error: errorMessage });
      return reply.code(500).send({ error: errorMessage });
    }
  });
};
