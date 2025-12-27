import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(MODULE_DIR, "..", "..", "..");
const CUSTOM_STRATEGIES_DIR = join(REPO_ROOT, "storage", "strategies", "custom");

interface CustomStrategyModule {
  metadata: {
    name: string;
    description: string;
    version?: string;
    author?: string;
    tags?: string[];
  };
  createStrategy: (config: unknown) => {
    onBar: (bar: unknown, index: number, bars: ReadonlyArray<unknown>) => "buy" | "sell" | null;
  };
}

interface StrategyRegistration {
  name: string;
  schema: z.ZodType<unknown>;
  factory: (params: unknown) => {
    onBar: (bar: unknown, index: number, bars: ReadonlyArray<unknown>) => "buy" | "sell" | null;
  };
}

/**
 * Discovers and loads all custom strategies from storage/strategies/custom/
 *
 * @returns Record of strategy name to strategy module
 */
export async function loadCustomStrategies(): Promise<Record<string, StrategyRegistration>> {
  const customStrategies: Record<string, StrategyRegistration> = {};

  try {
    // Read all .ts files in the custom strategies directory
    const files = await readdir(CUSTOM_STRATEGIES_DIR);
    const strategyFiles = files.filter(
      (f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes("README"),
    );

    for (const filename of strategyFiles) {
      try {
        const filePath = join(CUSTOM_STRATEGIES_DIR, filename);
        const fileUrl = pathToFileURL(filePath).href;

        // Dynamically import the strategy module
        const module = (await import(fileUrl)) as CustomStrategyModule;

        if (!module.metadata || !module.createStrategy) {
          console.warn(`Skipping ${filename}: missing required exports (metadata, createStrategy)`);
          continue;
        }

        const strategyName = module.metadata.name;

        // Create a zod schema that accepts any configuration
        // In a production system, each strategy could export its own schema
        const schema = z.object({}).passthrough();

        // Register the strategy
        customStrategies[strategyName] = {
          name: strategyName,
          schema,
          factory: (params: unknown) => {
            return module.createStrategy(params);
          },
        };

        console.log(`Loaded custom strategy: ${strategyName} (${filename})`);
      } catch (error) {
        console.error(`Failed to load strategy from ${filename}:`, error);
      }
    }

    return customStrategies;
  } catch (error) {
    // Directory might not exist or other error
    console.warn("Could not load custom strategies:", error);
    return {};
  }
}
