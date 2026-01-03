/**
 * Data query tools for MCP server.
 * Allows querying available datasets and data sources.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Database as SQLiteDatabase } from "sqlite";
import type sqlite3 from "sqlite3";
import { getStorageDir } from "../db.js";
import type { RegisterTool } from "../types.js";
import { DataRequest } from "@crucible-trader/sdk";
import { createCsvSource } from "@crucible-trader/data";

const TIMEFRAMES: readonly DataRequest["timeframe"][] = ["1d", "1h", "15m", "1m"];
const DATASET_DIR = join(getStorageDir(), "datasets");

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

const datasetPath = (symbol: string, timeframe: string): string => {
  const symbolSlug = slugify(symbol);
  const timeframeSlug = slugify(timeframe);
  return join(DATASET_DIR, `${symbolSlug}_${timeframeSlug}.csv`);
};

const DEFAULT_START_DATE = "1970-01-01";
const formatToday = (): string => new Date().toISOString().slice(0, 10);

async function doesDatasetExist(symbol: string, timeframe: string): Promise<boolean> {
  try {
    await stat(datasetPath(symbol, timeframe));
    return true;
  } catch {
    return false;
  }
}
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

  /**
   * Check whether data exists for a symbol/timeframe/date range.
   */
  registerTool(
    "check_data_availability",
    "Check whether data is available for a given symbol, timeframe, and date range. " +
      "Returns dataset presence along with suggestions (e.g., configure Tiingo/Polygon API keys for intraday).",
    {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker (e.g., 'MSFT')",
        },
        timeframe: {
          type: "string",
          enum: TIMEFRAMES,
          description: "Bar interval (1d, 1h, 15m, 1m)",
        },
        start: {
          type: "string",
          description: "Inclusive start date (ISO)",
        },
        end: {
          type: "string",
          description: "Inclusive end date (ISO)",
        },
        source: {
          type: "string",
          enum: ["csv", "auto"],
          description: "Optional source hint (defaults to csv files)",
        },
      },
      required: ["symbol", "timeframe"],
    },
    async (args) => {
      const rawSymbol = (args.symbol as string | undefined)?.trim();
      const rawTimeframe = (args.timeframe as string | undefined)?.trim().toLowerCase();

      if (!rawSymbol || !rawTimeframe) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "Missing symbol or timeframe",
                  fix: "Include both symbol (e.g., 'MSFT') and timeframe ('1d', '1h', '15m', or '1m').",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (!TIMEFRAMES.includes(rawTimeframe as DataRequest["timeframe"])) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "Unsupported timeframe",
                  fix: `Supported timeframes: ${TIMEFRAMES.join(", ")}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const symbol = rawSymbol.toUpperCase();
      const timeframe = rawTimeframe as DataRequest["timeframe"];
      const start = (args.start as string | undefined)?.trim() ?? DEFAULT_START_DATE;
      const end = (args.end as string | undefined)?.trim() ?? formatToday();
      const intraday = timeframe !== "1d";
      const csvRequest: DataRequest = {
        source: "csv",
        symbol,
        timeframe,
        start,
        end,
      };

      const csvSource = createCsvSource();
      let bars = [] as Awaited<ReturnType<typeof csvSource.loadBars>>;
      let available = false;
      let message = "";
      let reason = "";
      let suggestion = "";

      try {
        bars = await csvSource.loadBars(csvRequest);
        if (bars.length > 0) {
          available = true;
          message = "CSV data is available for the requested range.";
        } else {
          message =
            "CSV file exists but contains no bars in the requested range. Try widening the date window.";
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        message = errMsg;
        if (errMsg.includes("CSV file not found")) {
          reason = "CSV dataset not present for the requested symbol/timeframe.";
        } else {
          reason = errMsg;
        }
      }

      const hasTiingoKey = Boolean(process.env.TIINGO_API_KEY);
      const hasPolygonKey = Boolean(process.env.POLYGON_API_KEY);

      if (!available && intraday && !hasTiingoKey && !hasPolygonKey) {
        suggestion = [
          "Intraday data (1m/15m/1h) requires Tiingo or Polygon API credentials.",
          "Set TIINGO_API_KEY or POLYGON_API_KEY in your .env and restart the MCP server.",
        ].join(" ");
      } else if (!available) {
        suggestion =
          "Try running check_data_availability for other timeframes (daily data is most reliable) or verify the CSV file exists in storage/datasets.";
      }

      const alternativeTimeframes = await Promise.all(
        TIMEFRAMES.map(async (tf) => ({
          timeframe: tf,
          available: await doesDatasetExist(symbol, tf),
        })),
      );

      const primaryRange =
        available && bars.length > 0
          ? { start: bars[0]!.timestamp, end: bars[bars.length - 1]!.timestamp }
          : undefined;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                symbol,
                timeframe,
                start,
                end,
                source: "csv",
                available,
                rows: bars.length,
                range: primaryRange,
                reason: reason || (available ? undefined : "Dataset missing or empty"),
                message,
                suggestion,
                alternatives: alternativeTimeframes,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
