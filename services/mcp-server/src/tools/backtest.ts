/**
 * Backtest operation tools for MCP server.
 * Allows submitting, querying, and managing backtests.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Database as SQLiteDatabase } from "sqlite";
import type sqlite3 from "sqlite3";
import { assertValid, BacktestRequestSchema } from "@crucible-trader/sdk";
import { createMcpLogger } from "../logger.js";
import { getRepoRoot } from "../db.js";
import type { RegisterTool } from "../types.js";

const logger = createMcpLogger("@crucible-trader/mcp-server/tools/backtest");

type SqliteInstance = SQLiteDatabase<sqlite3.Database, sqlite3.Statement>;

/**
 * Register backtest-related tools.
 */
export async function registerBacktestTools(
  db: SqliteInstance,
  registerTool: RegisterTool,
): Promise<void> {
  /**
   * Submit a new backtest request.
   */
  registerTool(
    "submit_backtest",
    "Submit a new backtest request. Returns run ID immediately - backtest runs asynchronously. " +
      "CRITICAL: ALL strategies require a 'params' object. " +
      "For built-in strategies: ALWAYS call get_strategy_details FIRST to see required parameters with their defaults. " +
      "For custom strategies: Check get_custom_strategy_source to understand what parameters it expects, or use params={} if unsure. " +
      "Strategy names: Use exact name from list_strategies (e.g. 'sma_crossover') or custom strategy filename without .ts (e.g. 'my-strategy'). NO PREFIXES! " +
      "Data source: Use 'auto' to try CSV→Tiingo→Polygon automatically. " +
      "IMPORTANT: data must be an array, costs is required with feeBps/slippageBps. " +
      "Example: {runName:'Test SMA', data:[{source:'auto',symbol:'AAPL',timeframe:'1d',start:'2024-01-01',end:'2024-12-01'}], " +
      "strategy:{name:'sma_crossover',params:{fastPeriod:10,slowPeriod:30}}, costs:{feeBps:10,slippageBps:5}, initialCash:100000}",
    {
      type: "object",
      properties: {
        request: {
          type: "object",
          description:
            "BacktestRequest object with runName, data array, strategy with params, costs, and initialCash",
        },
      },
      required: ["request"],
    },
    async (args) => {
      const request = args.request as Record<string, unknown>;

      try {
        const runId = randomUUID();
        assertValid(BacktestRequestSchema, request);

        await db.run(
          `INSERT INTO runs (run_id, name, request_json, status, created_at) 
           VALUES (?, ?, ?, ?, datetime('now'))`,
          [runId, request.runName as string, JSON.stringify(request), "queued"],
        );

        logger.info("Backtest queued", { runId });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  runId,
                  status: "queued",
                  message:
                    "Backtest queued for execution. Use get_backtest_status to check progress.",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to submit backtest", { error: errorMessage });

        // Parse Zod validation errors for specific guidance
        let specificError = "Validation failed";
        let actionableHint = "";

        if (errorMessage.includes("strategy.params")) {
          specificError = "Missing or invalid strategy.params";
          actionableHint =
            "REQUIRED: strategy.params must be an object. " +
            "For built-in strategies: Call get_strategy_details first to see required parameters. " +
            "Example: strategy: {name: 'sma_crossover', params: {fastPeriod: 10, slowPeriod: 30}}";
        } else if (errorMessage.includes("strategy.name")) {
          specificError = "Missing or invalid strategy.name";
          actionableHint =
            "REQUIRED: strategy.name must be a string. " +
            "Use list_strategies to see available built-in strategies, or list_custom_strategies for custom ones. " +
            "Example: strategy: {name: 'sma_crossover', params: {...}}";
        } else if (errorMessage.includes("data") && errorMessage.includes("array")) {
          specificError = "Invalid data field - must be an array";
          actionableHint =
            "REQUIRED: data must be an array of data request objects. " +
            "Example: data: [{source: 'auto', symbol: 'AAPL', timeframe: '1d', start: '2024-01-01', end: '2024-12-01'}]";
        } else if (errorMessage.includes("costs")) {
          specificError = "Missing or invalid costs";
          actionableHint =
            "REQUIRED: costs must have feeBps and slippageBps. " +
            "Example: costs: {feeBps: 10, slippageBps: 5} (10 basis points fee, 5 basis points slippage)";
        } else if (errorMessage.includes("initialCash")) {
          specificError = "Missing or invalid initialCash";
          actionableHint =
            "REQUIRED: initialCash must be a positive number. " +
            "Example: initialCash: 100000 (start with $100,000)";
        } else if (errorMessage.includes("runName")) {
          specificError = "Missing or invalid runName";
          actionableHint =
            "REQUIRED: runName must be a string. " + "Example: runName: 'SMA Crossover on AAPL'";
        } else if (errorMessage.includes("source")) {
          specificError = "Invalid data source";
          actionableHint =
            "source must be one of: 'auto', 'csv', 'tiingo', or 'polygon'. " +
            "Recommended: Use 'auto' to try all sources automatically.";
        } else if (errorMessage.includes("timeframe")) {
          specificError = "Invalid timeframe";
          actionableHint =
            "timeframe must be one of: '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'. " +
            "Note: Intraday timeframes (1m-1h) require paid API subscriptions. Use '1d' for daily data.";
        } else {
          // Generic validation error
          actionableHint =
            "Common issues:\n" +
            "1. strategy.params is missing or not an object\n" +
            "2. data is not an array\n" +
            "3. costs missing feeBps/slippageBps\n" +
            "4. Missing required fields: runName, initialCash\n" +
            "Example valid request:\n" +
            "{\n" +
            "  runName: 'Test',\n" +
            "  data: [{source: 'auto', symbol: 'AAPL', timeframe: '1d', start: '2024-01-01', end: '2024-12-01'}],\n" +
            "  strategy: {name: 'sma_crossover', params: {fastPeriod: 10, slowPeriod: 30}},\n" +
            "  costs: {feeBps: 10, slippageBps: 5},\n" +
            "  initialCash: 100000\n" +
            "}";
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: specificError,
                  details: errorMessage,
                  fix: actionableHint,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );

  /**
   * Get backtest status.
   */
  registerTool(
    "get_backtest_status",
    "Get the current status of a backtest run. " +
      "Returns status (pending/running/completed/failed), progress info, and results if completed. " +
      "Call this after submit_backtest to check if backtest is done.",
    {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The run ID returned from submit_backtest",
        },
      },
      required: ["runId"],
    },
    async (args) => {
      const runId = args.runId as string;

      const row = await db.get<{
        status: string;
        error_message: string | null;
        summary_json: string | null;
        execution_time_ms: number | null;
      }>(
        `SELECT status, error_message, summary_json, execution_time_ms FROM runs WHERE run_id = ?`,
        [runId],
      );

      if (!row) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Run not found", runId }, null, 2),
            },
          ],
        };
      }

      if (row.status === "failed") {
        const errorMessage = row.error_message || "Unknown error";
        let actionableHint = "";

        // Parse execution errors for specific guidance
        if (errorMessage.includes("No bars loaded")) {
          actionableHint =
            "DATA ERROR: No data available for the requested symbol/timeframe. " +
            "Try: (1) Use '1d' timeframe instead of intraday, (2) Check symbol is valid, (3) Verify date range.";
        } else if (errorMessage.includes("Unknown strategy")) {
          actionableHint =
            "STRATEGY ERROR: Strategy name not recognized. " +
            "Use list_strategies for built-in strategies or list_custom_strategies for custom ones.";
        } else if (errorMessage.includes("param") || errorMessage.includes("parameter")) {
          actionableHint =
            "PARAMETER ERROR: Strategy parameters are invalid. " +
            "Call get_strategy_details to see required parameters and their types.";
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  runId,
                  status: "failed",
                  error: errorMessage,
                  fix: actionableHint || "Check error message for details",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const response: Record<string, unknown> = {
        runId,
        status: row.status,
      };

      if (row.summary_json) {
        response.summary = JSON.parse(row.summary_json);
      }

      if (row.execution_time_ms) {
        response.executionTimeMs = row.execution_time_ms;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );

  /**
   * Get backtest results.
   */
  registerTool(
    "get_backtest_results",
    "Get the full results JSON for a completed backtest, including all metrics and trades.",
    {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The run ID of the completed backtest",
        },
      },
      required: ["runId"],
    },
    async (args) => {
      const runId = args.runId as string;

      const row = await db.get<{
        status: string;
        summary_json: string | null;
      }>(`SELECT status, summary_json FROM runs WHERE run_id = ?`, [runId]);

      if (!row) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Run not found" }, null, 2),
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
                  error: "Backtest not completed",
                  status: row.status,
                  message: "Wait for backtest to complete before requesting results",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (!row.summary_json) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "No results available" }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: row.summary_json,
          },
        ],
      };
    },
  );

  /**
   * List backtests.
   */
  registerTool(
    "list_backtests",
    "List all backtests with their status and summary metrics. Optionally filter by status.",
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

      let query = `SELECT run_id, name, created_at, status, summary_json, execution_time_ms 
                   FROM runs`;
      const params: string[] = [];

      if (status) {
        query += ` WHERE status = ?`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(String(limit));

      const rows = await db.all<
        Array<{
          run_id: string;
          name: string | null;
          created_at: string;
          status: string;
          summary_json: string | null;
          execution_time_ms: number | null;
        }>
      >(query, params);

      const runs = rows.map((row) => ({
        runId: row.run_id,
        name: row.name,
        createdAt: row.created_at,
        status: row.status,
        summary: row.summary_json ? JSON.parse(row.summary_json) : null,
        executionTimeMs: row.execution_time_ms,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ runs, count: runs.length }, null, 2),
          },
        ],
      };
    },
  );

  /**
   * Get backtest report.
   */
  registerTool(
    "get_backtest_report",
    "Get the markdown report for a completed backtest.",
    {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The run ID of the backtest",
        },
      },
      required: ["runId"],
    },
    async (args) => {
      const runId = args.runId as string;

      const artifact = await db.get<{ path: string }>(
        `SELECT path FROM artifacts WHERE run_id = ? AND kind = 'report'`,
        [runId],
      );

      if (!artifact) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Report not found" }, null, 2),
            },
          ],
        };
      }

      try {
        const reportPath = join(getRepoRoot(), artifact.path);
        const reportContent = await readFile(reportPath, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: reportContent,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "Failed to read report",
                  message: error instanceof Error ? error.message : String(error),
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
