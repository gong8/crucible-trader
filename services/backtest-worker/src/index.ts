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

type ManifestStatus = "completed" | "failed";

interface Manifest {
  readonly runId: string;
  readonly summary?: BacktestResult["summary"];
  readonly artifacts?: BacktestResult["artifacts"];
  readonly datasets: ManifestDataset[];
  readonly engine?: {
    readonly version: string;
    readonly seed: number;
  };
  readonly metadata: {
    readonly name?: string;
    readonly createdAt: string;
    readonly status: ManifestStatus;
    readonly error?: string;
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

interface ManifestBasePayload {
  readonly metadata?: {
    readonly name?: string;
    readonly createdAt?: string;
    readonly status?: ManifestStatus;
  };
  readonly datasets?: ReadonlyArray<ManifestDataset>;
}

interface ManifestSuccessPayload extends ManifestBasePayload {
  readonly kind: "success";
  readonly result: BacktestResult;
}

interface ManifestFailurePayload extends ManifestBasePayload {
  readonly kind: "failure";
  readonly runId: string;
  readonly error: string;
}

export type ManifestPayload = ManifestSuccessPayload | ManifestFailurePayload;

export type ManifestWriter = (payload: ManifestPayload) => Promise<void>;

export const createManifestWriter = (options: ManifestWriterOptions = {}): ManifestWriter => {
  const runsDir = options.runsDir ?? RUNS_DIR;
  const now = options.now ?? (() => new Date());
  return async (payload) => {
    const runId = payload.kind === "success" ? payload.result.runId : payload.runId;
    const runDir = await ensureDirectory(runsDir, runId);

    const baseMetadata = payload.metadata ?? {};
    const baseDatasets = payload.datasets ? [...payload.datasets] : [];

    let summary: BacktestResult["summary"] | undefined;
    let artifacts: BacktestResult["artifacts"] | undefined;
    let engine: Manifest["engine"] | undefined;
    let status: ManifestStatus = baseMetadata.status ?? "completed";
    let error: string | undefined;

    if (payload.kind === "success") {
      summary = payload.result.summary;
      artifacts = {
        ...payload.result.artifacts,
        reportMd: payload.result.artifacts.reportMd ?? `${runDir}/report.md`,
      };
      engine = {
        version: "0.0.1",
        seed: (payload.result.diagnostics?.seed as number) ?? 42,
      };
    } else {
      status = "failed";
      error = payload.error;
    }

    const manifest: Manifest = {
      runId,
      summary,
      artifacts,
      datasets: baseDatasets,
      engine,
      metadata: {
        name: baseMetadata.name,
        createdAt: baseMetadata.createdAt ?? now().toISOString(),
        status,
        error,
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
      await deps.writeManifest({
        kind: "success",
        result,
        metadata: {
          name: job.request.runName,
          createdAt: (deps.now ?? (() => new Date()))().toISOString(),
          status: "completed",
        },
        datasets: job.request.data.map((series) => ({
          symbol: series.symbol,
          timeframe: series.timeframe,
          source: series.source,
          start: series.start,
          end: series.end,
          adjusted: series.adjusted,
        })),
      });

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
      const failureDatasets = job.request.data.map((series) => ({
        symbol: series.symbol,
        timeframe: series.timeframe,
        source: series.source,
        start: series.start,
        end: series.end,
        adjusted: series.adjusted,
      }));
      try {
        await deps.writeManifest({
          kind: "failure",
          runId: job.runId,
          error: errorMessage,
          metadata: {
            name: job.request.runName,
            createdAt: (deps.now ?? (() => new Date()))().toISOString(),
            status: "failed",
          },
          datasets: failureDatasets,
        });
      } catch (manifestError) {
        deps.logger.error("Failed to persist failure manifest", {
          runId: job.runId,
          error: manifestError instanceof Error ? manifestError.message : String(manifestError),
        });
      }
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
