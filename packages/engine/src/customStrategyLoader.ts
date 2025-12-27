import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createJiti } from "jiti";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(MODULE_DIR, "..", "..", "..");
const CUSTOM_STRATEGIES_DIR = join(REPO_ROOT, "storage", "strategies", "custom");

// Create jiti instance for loading TypeScript files
const jiti = createJiti(MODULE_DIR, {
  interopDefault: true,
});

interface StrategySignal {
  side: "buy" | "sell";
  timestamp: string;
  reason: string;
  strength?: number;
}

interface StrategyContext {
  symbol: string;
}

interface CustomStrategyModule {
  metadata: {
    name: string;
    description: string;
    version?: string;
    author?: string;
    tags?: string[];
  };
  createStrategy: (config: unknown) => {
    onInit?: (context: StrategyContext) => void;
    onBar: (context: StrategyContext, bar: unknown) => StrategySignal | null;
    onStop?: (context: StrategyContext) => StrategySignal | null;
  };
}

interface StrategyRegistration {
  name: string;
  schema: z.ZodType<unknown>;
  factory: (params: unknown) => {
    onInit?: (context: StrategyContext) => void;
    onBar: (context: StrategyContext, bar: unknown) => StrategySignal | null;
    onStop?: (context: StrategyContext) => StrategySignal | null;
  };
}

/**
 * Discovers and loads all custom strategies from storage/strategies/custom/
 *
 * @returns Record of strategy name to strategy module
 */
export async function loadCustomStrategies(): Promise<Record<string, StrategyRegistration>> {
  const customStrategies: Record<string, StrategyRegistration> = {};

  console.log(`[customStrategyLoader] Loading custom strategies from: ${CUSTOM_STRATEGIES_DIR}`);

  try {
    // Read all .ts files in the custom strategies directory
    const files = await readdir(CUSTOM_STRATEGIES_DIR);
    console.log(`[customStrategyLoader] Found files:`, files);

    const strategyFiles = files.filter(
      (f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes("README"),
    );

    console.log(`[customStrategyLoader] Strategy files to load:`, strategyFiles);

    for (const filename of strategyFiles) {
      try {
        const filePath = join(CUSTOM_STRATEGIES_DIR, filename);

        // Use jiti to import TypeScript files directly
        const module = jiti(filePath) as CustomStrategyModule;

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

        console.log(
          `[customStrategyLoader] ✓ Loaded custom strategy: ${strategyName} (${filename})`,
        );
      } catch (error) {
        console.error(`[customStrategyLoader] ✗ Failed to load strategy from ${filename}:`, error);
      }
    }

    console.log(
      `[customStrategyLoader] Successfully loaded ${Object.keys(customStrategies).length} custom strategies:`,
      Object.keys(customStrategies),
    );
    return customStrategies;
  } catch (error) {
    // Directory might not exist or other error
    console.warn("[customStrategyLoader] Could not load custom strategies:", error);
    return {};
  }
}
