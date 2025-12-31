/**
 * Metrics and analysis tools for MCP server.
 * Allows calculating metrics and comparing backtests.
 */

import type { Database as SQLiteDatabase } from "sqlite";
import type sqlite3 from "sqlite3";
import type { RegisterTool } from "../types.js";

type SqliteInstance = SQLiteDatabase<sqlite3.Database, sqlite3.Statement>;

/**
 * Register metrics and analysis tools.
 */
export async function registerMetricsTools(
  db: SqliteInstance,
  registerTool: RegisterTool,
): Promise<void> {
  /**
   * Get available metrics.
   */
  registerTool(
    "get_available_metrics",
    "Get list of all available performance metrics that can be calculated.",
    {
      type: "object",
      properties: {},
    },
    async () => {
      const metrics = [
        {
          key: "sharpe",
          name: "Sharpe Ratio",
          description: "Risk-adjusted return metric (annualized)",
          higherIsBetter: true,
        },
        {
          key: "sortino",
          name: "Sortino Ratio",
          description: "Downside risk-adjusted return (annualized)",
          higherIsBetter: true,
        },
        {
          key: "max_dd",
          name: "Maximum Drawdown",
          description: "Largest peak-to-trough decline (negative %)",
          higherIsBetter: false,
        },
        {
          key: "cagr",
          name: "CAGR",
          description: "Compound annual growth rate",
          higherIsBetter: true,
        },
        {
          key: "winrate",
          name: "Win Rate",
          description: "Percentage of profitable trades",
          higherIsBetter: true,
        },
        {
          key: "total_pnl",
          name: "Total P&L",
          description: "Total profit/loss in dollars",
          higherIsBetter: true,
        },
        {
          key: "total_return",
          name: "Total Return",
          description: "Total return as a percentage",
          higherIsBetter: true,
        },
        {
          key: "num_trades",
          name: "Number of Trades",
          description: "Total number of trades executed",
          higherIsBetter: null,
        },
        {
          key: "profit_factor",
          name: "Profit Factor",
          description: "Ratio of gross profit to gross loss",
          higherIsBetter: true,
        },
      ];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ metrics }, null, 2),
          },
        ],
      };
    },
  );

  /**
   * Compare backtests.
   */
  registerTool(
    "compare_backtests",
    "Compare metrics from multiple backtests side-by-side.",
    {
      type: "object",
      properties: {
        runIds: {
          type: "array",
          description: "Array of run IDs to compare",
          items: { type: "string" },
        },
      },
      required: ["runIds"],
    },
    async (args) => {
      const runIds = args.runIds as string[];

      if (!Array.isArray(runIds) || runIds.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "runIds must be a non-empty array" }, null, 2),
            },
          ],
        };
      }

      const placeholders = runIds.map(() => "?").join(",");
      const query = `SELECT run_id, name, summary_json, execution_time_ms, created_at 
                     FROM runs 
                     WHERE run_id IN (${placeholders})`;

      const rows = await db.all<
        Array<{
          run_id: string;
          name: string | null;
          summary_json: string | null;
          execution_time_ms: number | null;
          created_at: string;
        }>
      >(query, runIds);

      const comparison = rows.map((row) => {
        const summary = row.summary_json ? JSON.parse(row.summary_json) : {};
        return {
          runId: row.run_id,
          name: row.name,
          createdAt: row.created_at,
          executionTimeMs: row.execution_time_ms,
          metrics: summary,
        };
      });

      // Calculate relative performance
      const metricKeys = Object.keys(comparison[0]?.metrics ?? {});
      const relativePerformance: Record<string, Record<string, number>> = {};

      for (const key of metricKeys) {
        const values = comparison.map((c) => c.metrics[key] as number).filter((v) => v !== null);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min;

        relativePerformance[key] = {};
        for (const run of comparison) {
          const value = run.metrics[key] as number;
          if (value !== null && range > 0) {
            relativePerformance[key][run.runId] = ((value - min) / range) * 100;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                comparison,
                relativePerformance,
                count: comparison.length,
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
   * Get statistical tests.
   */
  registerTool(
    "get_statistical_tests",
    "Get statistical test results for a backtest (walk-forward, permutation tests, etc.).",
    {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "Run ID to get statistical tests for",
        },
      },
      required: ["runId"],
    },
    async (args) => {
      const runId = args.runId as string;

      const tests = await db.all<
        Array<{
          id: number;
          test_type: string;
          p_value: number | null;
          confidence_level: number | null;
          in_sample_metric: number | null;
          out_sample_metric: number | null;
          metadata_json: string | null;
          created_at: string;
        }>
      >(`SELECT * FROM stat_tests WHERE run_id = ? ORDER BY created_at DESC`, [runId]);

      const results = tests.map((test) => ({
        id: test.id,
        testType: test.test_type,
        pValue: test.p_value,
        confidenceLevel: test.confidence_level,
        inSampleMetric: test.in_sample_metric,
        outSampleMetric: test.out_sample_metric,
        metadata: test.metadata_json ? JSON.parse(test.metadata_json) : null,
        createdAt: test.created_at,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ runId, tests: results, count: results.length }, null, 2),
          },
        ],
      };
    },
  );
}
