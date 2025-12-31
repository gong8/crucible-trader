/**
 * Optimization tools for MCP server.
 * Allows running and managing parameter optimization jobs.
 */

import { randomUUID } from "node:crypto";
import type { Database as SQLiteDatabase } from "sqlite";
import type sqlite3 from "sqlite3";
import {
  assertValid,
  OptimizationRequestSchema,
  type OptimizationRequest,
  type OptimizationResult,
} from "@crucible-trader/sdk";
import { expandParamGrid } from "@crucible-trader/stats";
import type { RegisterTool } from "../types.js";
import { createMcpLogger } from "../logger.js";

const logger = createMcpLogger("@crucible-trader/mcp-server/tools/optimization");

type SqliteInstance = SQLiteDatabase<sqlite3.Database, sqlite3.Statement>;

/**
 * Register optimization-related tools.
 */
export async function registerOptimizationTools(
  db: SqliteInstance,
  registerTool: RegisterTool,
): Promise<void> {
  /**
   * Submit optimization job.
   */
  registerTool(
    "submit_optimization",
    "Submit a grid search optimization job to find the best strategy parameters.",
    {
      type: "object",
      properties: {
        request: {
          type: "object",
          description:
            "OptimizationRequest object with name, baseRequest, strategy, paramGrid, objective, etc.",
        },
      },
      required: ["request"],
    },
    async (args) => {
      const request = assertValid(
        OptimizationRequestSchema,
        args.request,
        "optimization request",
      ) as OptimizationRequest;

      const optId = `opt-${randomUUID()}`;
      const totalCombinations = expandParamGrid(request.paramGrid).length;

      logger.info(`Submitting optimization: ${optId}`, { name: request.name, totalCombinations });

      await db.run(
        `INSERT INTO optimizations (
          opt_id, name, strategy_name, param_grid_json, objective,
          constraints_json, walk_forward_config_json, bootstrap_iterations,
          permutation_iterations, seed, total_combinations, base_request_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          optId,
          request.name,
          request.strategy.name,
          JSON.stringify(request.paramGrid),
          request.objective,
          request.constraints ? JSON.stringify(request.constraints) : null,
          request.walkForward ? JSON.stringify(request.walkForward) : null,
          request.bootstrapIterations ?? null,
          request.permutationIterations ?? null,
          request.seed ?? null,
          totalCombinations,
          JSON.stringify(request.baseRequest),
        ],
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                optId,
                status: "queued",
                totalCombinations,
                message: "Optimization job submitted successfully",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /**
   * Get optimization status.
   */
  registerTool(
    "get_optimization_status",
    "Get the current status and progress of an optimization job.",
    {
      type: "object",
      properties: {
        optId: {
          type: "string",
          description: "The optimization ID returned from submit_optimization",
        },
      },
      required: ["optId"],
    },
    async (args) => {
      const optId = args.optId as string;

      const row = await db.get<{
        status: string;
        total_combinations: number;
        completed_combinations: number;
        estimated_time_remaining_ms: number | null;
        error_message: string | null;
      }>(
        `SELECT status, total_combinations, completed_combinations, estimated_time_remaining_ms, error_message
         FROM optimizations WHERE opt_id = ?`,
        [optId],
      );

      if (!row) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Optimization not found" }, null, 2),
            },
          ],
        };
      }

      const progress =
        row.total_combinations > 0
          ? (row.completed_combinations / row.total_combinations) * 100
          : 0;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                optId,
                status: row.status,
                totalCombinations: row.total_combinations,
                completedCombinations: row.completed_combinations,
                progress: progress.toFixed(2) + "%",
                estimatedTimeRemainingMs: row.estimated_time_remaining_ms,
                error: row.error_message,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /**
   * Get optimization results.
   */
  registerTool(
    "get_optimization_results",
    "Get the full results of a completed optimization including best parameters and all combinations tested.",
    {
      type: "object",
      properties: {
        optId: {
          type: "string",
          description: "The optimization ID",
        },
      },
      required: ["optId"],
    },
    async (args) => {
      const optId = args.optId as string;

      const row = await db.get<{
        name: string;
        strategy_name: string;
        objective: string;
        status: string;
        total_combinations: number;
        best_params_json: string | null;
        best_score: number | null;
        best_robustness_score: number | null;
        results_json: string | null;
        walk_forward_results_json: string | null;
        created_at: string;
        completed_at: string | null;
        error_message: string | null;
      }>(`SELECT * FROM optimizations WHERE opt_id = ?`, [optId]);

      if (!row) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Optimization not found" }, null, 2),
            },
          ],
        };
      }

      if (row.status !== "completed") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  optId,
                  status: row.status,
                  message: "Optimization not yet completed",
                  error: row.error_message,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const result: OptimizationResult = {
        optId,
        name: row.name,
        status: row.status as "completed",
        strategyName: row.strategy_name,
        objective: row.objective as OptimizationRequest["objective"],
        totalCombinations: row.total_combinations,
        bestParams: row.best_params_json ? JSON.parse(row.best_params_json) : undefined,
        bestScore: row.best_score ?? undefined,
        bestRobustnessScore: row.best_robustness_score ?? undefined,
        allResults: row.results_json ? JSON.parse(row.results_json) : undefined,
        walkForwardResults: row.walk_forward_results_json
          ? JSON.parse(row.walk_forward_results_json)
          : undefined,
        createdAt: row.created_at,
        completedAt: row.completed_at ?? undefined,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  /**
   * List optimizations.
   */
  registerTool(
    "list_optimizations",
    "List all optimization jobs with their status and best results.",
    {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Optional filter by status: queued, running, completed, or failed",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 50)",
        },
      },
    },
    async (args) => {
      const status = args.status as string | undefined;
      const limit = (args.limit as number) ?? 50;

      let query = `SELECT opt_id, name, strategy_name, objective, status, total_combinations,
                          best_score, created_at, completed_at
                   FROM optimizations`;
      const params: (string | number)[] = [];

      if (status) {
        query += ` WHERE status = ?`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);

      const rows = await db.all<
        Array<{
          opt_id: string;
          name: string;
          strategy_name: string;
          objective: string;
          status: string;
          total_combinations: number;
          best_score: number | null;
          created_at: string;
          completed_at: string | null;
        }>
      >(query, params);

      const optimizations = rows.map((row) => ({
        optId: row.opt_id,
        name: row.name,
        strategyName: row.strategy_name,
        objective: row.objective,
        status: row.status,
        totalCombinations: row.total_combinations,
        bestScore: row.best_score,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ optimizations, count: optimizations.length }, null, 2),
          },
        ],
      };
    },
  );
}
