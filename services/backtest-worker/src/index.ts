import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BacktestResult } from "@crucible-trader/sdk";

import { runBacktest } from "@crucible-trader/engine";
import { createLogger } from "@crucible-trader/logger";
import { createApiDatabase } from "@crucible-trader/api/db";

// Import from compiled dist since workspace module resolution has issues
import { JobQueue, type QueueJob } from "../../api/dist/queue.js";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const RUNS_DIR = join(MODULE_DIR, "..", "..", "..", "storage", "runs");

interface Manifest {
  readonly runId: string;
  readonly summary: BacktestResult["summary"];
  readonly artifacts: BacktestResult["artifacts"];
  readonly engine: {
    readonly version: string;
    readonly seed: number;
  };
  readonly metadata: {
    readonly name?: string;
    readonly createdAt: string;
    readonly status: string;
  };
}

const logger = createLogger("services/backtest-worker");

const ensureDirectory = async (...parts: string[]): Promise<string> => {
  const dir = join(...parts);
  await mkdir(dir, { recursive: true });
  return dir;
};

const writeManifest = async (
  result: BacktestResult,
  metadata?: {
    readonly name?: string;
    readonly createdAt?: string;
    readonly status?: string;
  },
): Promise<void> => {
  const runDir = await ensureDirectory(RUNS_DIR, result.runId);
  const manifest: Manifest = {
    runId: result.runId,
    summary: result.summary,
    artifacts: {
      ...result.artifacts,
      reportMd: result.artifacts.reportMd ?? `${runDir}/report.md`,
    },
    engine: {
      version: "0.0.1",
      seed: (result.diagnostics?.seed as number) ?? 42,
    },
    metadata: {
      name: metadata?.name,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      status: metadata?.status ?? "completed",
    },
  };

  const manifestPath = join(runDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf-8",
  });
};

// Main worker initialization
const main = async (): Promise<void> => {
  logger.info("Initializing backtest worker...");

  const database = await createApiDatabase();
  const queue = new JobQueue({ database });

  const handleJob = async (job: QueueJob): Promise<void> => {
    logger.info("Processing run", { runId: job.runId });

    try {
      // Fetch risk profile if specified
      let riskProfile;
      if (job.request.riskProfileId) {
        riskProfile = await database.getRiskProfileById(job.request.riskProfileId);
      }

      const result = await runBacktest(job.request, { runId: job.runId, riskProfile });
      await writeManifest(result, {
        name: job.request.runName,
        createdAt: new Date().toISOString(),
        status: "completed",
      });

      // Save result to database
      await database.saveRunResult(result);
      await database.updateRunStatus(job.runId, "completed");

      logger.info("Run completed successfully", { runId: job.runId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to process run", {
        runId: job.runId,
        error: errorMessage,
      });

      // Mark as failed in database with error message
      await database.updateRunStatus(job.runId, "failed", errorMessage);
      throw error;
    }
  };

  queue.onJob(handleJob);

  logger.info("Backtest worker ready and polling for jobs");
};

void main().catch((error) => {
  logger.error("Worker initialization failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
