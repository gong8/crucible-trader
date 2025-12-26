import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(MODULE_DIR, "..", "..", "..");
loadEnv({ path: join(REPO_ROOT, ".env") });
loadEnv();

import type { BacktestResult } from "@crucible-trader/sdk";

import { runBacktest } from "@crucible-trader/engine";
import { createLogger } from "@crucible-trader/logger";
import { createApiDatabase } from "@crucible-trader/api/db";

// Import from compiled dist since workspace module resolution has issues
import { JobQueue, type QueueJob } from "../../api/dist/queue.js";

const RUNS_DIR = join(MODULE_DIR, "..", "..", "..", "storage", "runs");

interface ManifestDataset {
  readonly symbol: string;
  readonly timeframe: string;
  readonly source: string;
  readonly start?: string;
  readonly end?: string;
  readonly adjusted?: boolean;
}

interface Manifest {
  readonly runId: string;
  readonly summary: BacktestResult["summary"];
  readonly artifacts: BacktestResult["artifacts"];
  readonly datasets: ManifestDataset[];
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

interface ManifestWriterOptions {
  readonly runsDir?: string;
  readonly now?: () => Date;
}

export type ManifestWriter = (
  result: BacktestResult,
  metadata?: {
    readonly name?: string;
    readonly createdAt?: string;
    readonly status?: string;
  },
  datasets?: ReadonlyArray<ManifestDataset>,
) => Promise<void>;

export const createManifestWriter = (options: ManifestWriterOptions = {}): ManifestWriter => {
  const runsDir = options.runsDir ?? RUNS_DIR;
  const now = options.now ?? (() => new Date());
  return async (result, metadata, datasets) => {
    const runDir = await ensureDirectory(runsDir, result.runId);
    const manifest: Manifest = {
      runId: result.runId,
      summary: result.summary,
      artifacts: {
        ...result.artifacts,
        reportMd: result.artifacts.reportMd ?? `${runDir}/report.md`,
      },
      datasets: datasets ? [...datasets] : [],
      engine: {
        version: "0.0.1",
        seed: (result.diagnostics?.seed as number) ?? 42,
      },
      metadata: {
        name: metadata?.name,
        createdAt: metadata?.createdAt ?? now().toISOString(),
        status: metadata?.status ?? "completed",
      },
    };

    const manifestPath = join(runDir, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf-8",
    });
  };
};

export const writeManifest = createManifestWriter();

type WorkerDatabase = Pick<
  Awaited<ReturnType<typeof createApiDatabase>>,
  "getRiskProfileById" | "saveRunResult" | "updateRunStatus"
>;

interface WorkerDependencies {
  readonly database: WorkerDatabase;
  readonly runBacktest: typeof runBacktest;
  readonly logger: ReturnType<typeof createLogger>;
  readonly writeManifest: ManifestWriter;
  readonly now?: () => Date;
}

export const createJobHandler =
  (deps: WorkerDependencies) =>
  async (job: QueueJob): Promise<void> => {
    deps.logger.info("Processing run", { runId: job.runId });

    try {
      let riskProfile;
      if (job.request.riskProfileId) {
        riskProfile = await deps.database.getRiskProfileById(job.request.riskProfileId);
      }

      const result = await deps.runBacktest(job.request, { runId: job.runId, riskProfile });
      await deps.writeManifest(
        result,
        {
          name: job.request.runName,
          createdAt: (deps.now ?? (() => new Date()))().toISOString(),
          status: "completed",
        },
        job.request.data.map((series) => ({
          symbol: series.symbol,
          timeframe: series.timeframe,
          source: series.source,
          start: series.start,
          end: series.end,
          adjusted: series.adjusted,
        })),
      );

      await deps.database.saveRunResult(result);
      await deps.database.updateRunStatus(job.runId, "completed");

      deps.logger.info("Run completed successfully", { runId: job.runId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      deps.logger.error("Failed to process run", {
        runId: job.runId,
        error: errorMessage,
      });
      await deps.database.updateRunStatus(job.runId, "failed", errorMessage);
      throw error;
    }
  };

// Main worker initialization
const main = async (): Promise<void> => {
  logger.info("Initializing backtest worker...");

  const database = await createApiDatabase();
  const queue = new JobQueue({ database });

  const handleJob = createJobHandler({
    database,
    runBacktest,
    logger,
    writeManifest,
    now: () => new Date(),
  });

  queue.onJob(handleJob);

  logger.info("Backtest worker ready and polling for jobs");
};

const shouldAutostart = process.env.CRUCIBLE_WORKER_AUTOSTART !== "false";

if (shouldAutostart) {
  void main().catch((error) => {
    logger.error("Worker initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
