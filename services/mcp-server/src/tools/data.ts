/**
 * Data query tools for MCP server.
 * Allows querying available datasets and data sources.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Database as SQLiteDatabase } from "sqlite";
import type sqlite3 from "sqlite3";
import { getStorageDir } from "../db.js";
import type { RegisterTool } from "../types.js";

type SqliteInstance = SQLiteDatabase<sqlite3.Database, sqlite3.Statement>;

/**
 * Register data-related tools.
 */
export async function registerDataTools(
  db: SqliteInstance,
  registerTool: RegisterTool,
): Promise<void> {
  /**
   * List available datasets.
   */
  registerTool(
    "list_datasets",
    "List all available datasets (CSV files and cached data).",
    {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Optional filter by symbol",
        },
        source: {
          type: "string",
          description: "Optional filter by data source (csv, tiingo, polygon)",
        },
      },
    },
    async (args) => {
      const symbol = args.symbol as string | undefined;
      const source = args.source as string | undefined;

      let query = `SELECT id, source, symbol, timeframe, start, end, adjusted, path, rows, created_at 
                   FROM datasets WHERE 1=1`;
      const params: string[] = [];

      if (symbol) {
        query += ` AND symbol = ?`;
        params.push(symbol);
      }

      if (source) {
        query += ` AND source = ?`;
        params.push(source);
      }

      query += ` ORDER BY created_at DESC`;

      const rows = await db.all<
        Array<{
          id: number;
          source: string;
          symbol: string;
          timeframe: string;
          start: string | null;
          end: string | null;
          adjusted: number | null;
          path: string;
          rows: number | null;
          created_at: string;
        }>
      >(query, params);

      const datasets = rows.map((row) => ({
        id: row.id,
        source: row.source,
        symbol: row.symbol,
        timeframe: row.timeframe,
        start: row.start,
        end: row.end,
        adjusted: row.adjusted === 1,
        path: row.path,
        rows: row.rows,
        createdAt: row.created_at,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ datasets, count: datasets.length }, null, 2),
          },
        ],
      };
    },
  );

  /**
   * List available CSV files.
   */
  registerTool(
    "list_csv_files",
    "List all CSV files in the datasets directory.",
    {
      type: "object",
      properties: {},
    },
    async () => {
      try {
        const datasetsDir = join(getStorageDir(), "datasets");
        const files = await readdir(datasetsDir);
        const csvFiles = files.filter((f) => f.endsWith(".csv"));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ files: csvFiles, count: csvFiles.length }, null, 2),
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
                  error: "Failed to list CSV files",
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

  /**
   * Get data source information.
   */
  registerTool(
    "get_data_sources",
    "Get information about available data sources (CSV, Tiingo, Polygon).",
    {
      type: "object",
      properties: {},
    },
    async () => {
      const sources = [
        {
          id: "csv",
          name: "CSV",
          description: "Local CSV files in storage/datasets/",
          supportsAdjusted: true,
          requiresApiKey: false,
        },
        {
          id: "tiingo",
          name: "Tiingo",
          description: "Tiingo API for EOD and intraday data",
          supportsAdjusted: true,
          requiresApiKey: true,
          apiKeyEnvVar: "TIINGO_API_KEY",
        },
        {
          id: "polygon",
          name: "Polygon.io",
          description: "Polygon.io API for market data",
          supportsAdjusted: true,
          requiresApiKey: true,
          apiKeyEnvVar: "POLYGON_API_KEY",
        },
      ];

      // Check which sources are configured
      const configured = sources.map((source) => ({
        ...source,
        configured: !source.requiresApiKey || !!process.env[source.apiKeyEnvVar ?? ""],
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ sources: configured }, null, 2),
          },
        ],
      };
    },
  );

  /**
   * Get supported timeframes.
   */
  registerTool(
    "get_timeframes",
    "Get list of supported timeframes for backtesting.",
    {
      type: "object",
      properties: {},
    },
    async () => {
      const timeframes = [
        { id: "1m", name: "1 Minute", description: "1-minute bars" },
        { id: "15m", name: "15 Minutes", description: "15-minute bars" },
        { id: "1h", name: "1 Hour", description: "1-hour bars" },
        { id: "1d", name: "1 Day", description: "Daily bars (end-of-day)" },
      ];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ timeframes }, null, 2),
          },
        ],
      };
    },
  );
}
