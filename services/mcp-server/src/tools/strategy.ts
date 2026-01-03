/**
 * Strategy management tools for MCP server.
 * Allows listing and getting details about available strategies.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Database as SQLiteDatabase } from "sqlite";
import type sqlite3 from "sqlite3";
import { strategyConfigs, strategyList } from "@crucible-trader/sdk";
import { getRepoRoot } from "../db.js";
import type { RegisterTool } from "../types.js";

type SqliteInstance = SQLiteDatabase<sqlite3.Database, sqlite3.Statement>;

interface CustomStrategyParameter {
  readonly name: string;
  readonly type: "number" | "string" | "boolean";
  readonly label?: string;
  readonly description?: string;
  readonly default?: number | string | boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly required?: boolean;
}

interface CustomStrategyMetadata {
  readonly description?: string;
  readonly version?: string;
  readonly author?: string;
  readonly tags?: readonly string[];
  readonly parameters?: readonly CustomStrategyParameter[];
}

const CUSTOM_METADATA_SUFFIX = ".meta.json";

const METADATA_ENCODING = "utf-8";

async function loadCustomStrategyMetadata(
  customDir: string,
  filename: string,
): Promise<CustomStrategyMetadata | undefined> {
  const metadataFilename = `${filename.replace(/\.ts$/u, "")}${CUSTOM_METADATA_SUFFIX}`;
  const metadataPath = join(customDir, metadataFilename);
  try {
    const contents = await readFile(metadataPath, { encoding: METADATA_ENCODING });
    return JSON.parse(contents) as CustomStrategyMetadata;
  } catch {
    return undefined;
  }
}

/**
 * Register strategy-related tools.
 */
export async function registerStrategyTools(
  _db: SqliteInstance,
  registerTool: RegisterTool,
): Promise<void> {
  /**
   * List available strategies.
   */
  registerTool(
    "list_strategies",
    "List all BUILT-IN trading strategies with their descriptions and parameters. " +
      "For custom strategies, use list_custom_strategies. " +
      "Strategy names returned here can be used directly in submit_backtest (no prefix needed).",
    {
      type: "object",
      properties: {},
    },
    async () => {
      const strategies = strategyList.map((config) => {
        return {
          name: config.key,
          displayName: config.title,
          description: config.description,
          parameters: config.fields.map((field) => ({
            name: field.key,
            label: field.label,
            type: field.type,
            defaultValue: config.defaults[field.key],
            min: field.min,
            max: field.max,
            step: field.step,
            helpText: field.description,
          })),
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ strategies, count: strategies.length }, null, 2),
          },
        ],
      };
    },
  );

  /**
   * Get strategy details.
   */
  registerTool(
    "get_strategy_details",
    "Get detailed parameter information for a BUILT-IN strategy. " +
      "Returns parameter names, types, defaults, min/max values, and descriptions. " +
      "ALWAYS call this before submitting a backtest with a built-in strategy to get correct parameter names and default values! " +
      "IMPORTANT: This only works for built-in strategies (from list_strategies), NOT custom strategies. " +
      "For custom strategies, use get_custom_strategy_source instead.",
    {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Strategy name (e.g., 'buy_hold', 'sma_crossover', 'mean_reversion')",
        },
      },
      required: ["name"],
    },
    async (args) => {
      const name = args.name as string;
      const config = strategyConfigs[name as keyof typeof strategyConfigs];

      if (!config) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Strategy not found",
                  availableStrategies: strategyList,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const details = {
        name,
        displayName: config.title,
        description: config.description,
        parameters: config.fields.map((field) => ({
          name: field.key,
          label: field.label,
          type: field.type,
          defaultValue: config.defaults[field.key],
          min: field.min,
          max: field.max,
          step: field.step,
          helpText: field.description,
        })),
        exampleParams: config.defaults,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );

  /**
   * List custom strategies.
   */
  registerTool(
    "list_custom_strategies",
    "List custom user-defined strategies. " +
      "Returns strategy names WITHOUT .ts extension. " +
      "Use these names directly in submit_backtest - NO 'custom:' prefix needed! " +
      "Example: If file is 'my-strategy.ts', use name='my-strategy' in backtest request.",
    {
      type: "object",
      properties: {},
    },
    async () => {
      try {
        const customDir = join(getRepoRoot(), "storage", "strategies", "custom");
        const files = await readdir(customDir);
        const tsFiles = files.filter((f) => f.endsWith(".ts"));

        const strategies = await Promise.all(
          tsFiles.map(async (file) => {
            const metadata = await loadCustomStrategyMetadata(customDir, file);
            const nameWithoutExtension = file.replace(/\.ts$/u, "");
            return {
              filename: file,
              name: nameWithoutExtension,
              description: metadata?.description,
              version: metadata?.version,
              author: metadata?.author,
              tags: metadata?.tags ?? [],
              parameters: metadata?.parameters ?? [],
            };
          }),
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { customStrategies: strategies, count: strategies.length },
                null,
                2,
              ),
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
                  error: "Failed to list custom strategies",
                  message: error instanceof Error ? error.message : String(error),
                  customStrategies: [],
                  count: 0,
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
   * Get custom strategy source code.
   */
  registerTool(
    "get_custom_strategy_source",
    "Get the TypeScript source code of a custom strategy. " +
      "Use this to understand how a custom strategy works before running a backtest. " +
      "Filename should include .ts extension (e.g., 'my-strategy.ts').",
    {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Strategy filename (e.g., 'my-strategy.ts')",
        },
      },
      required: ["filename"],
    },
    async (args) => {
      const rawFilename = args.filename;
      if (typeof rawFilename !== "string" || rawFilename.trim().length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "Missing filename",
                  fix: "Provide the custom strategy filename including the .ts extension (e.g., 'macd-crossover.ts') in the arguments.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const filename = rawFilename.trim();

      // Validate filename (basic security check)
      if (!filename.endsWith(".ts") || filename.includes("..") || filename.includes("/")) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Invalid filename" }, null, 2),
            },
          ],
        };
      }

      try {
        const filePath = join(getRepoRoot(), "storage", "strategies", "custom", filename);
        const source = await readFile(filePath, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ filename, source }, null, 2),
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
                  error: "Failed to read strategy file",
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
