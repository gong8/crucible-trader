import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BacktestResult } from "@crucible-trader/sdk";

import { runBacktest } from "@crucible-trader/engine";
import { onJob, type QueueJob } from "@crucible-trader/api/queue";
import { createLogger } from "@crucible-trader/logger";

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
}

const logger = createLogger("services/backtest-worker");

const ensureDirectory = async (...parts: string[]): Promise<string> => {
  const dir = join(...parts);
  await mkdir(dir, { recursive: true });
  return dir;
};

const writeManifest = async (result: BacktestResult): Promise<void> => {
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
  };

  const manifestPath = join(runDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf-8",
  });

  // TODO[phase-0-next]: emit parquet/trades/bars files once available.
};

const handleJob = async (job: QueueJob): Promise<void> => {
  logger.info("Processing run", { runId: job.runId });

  try {
    const result = await runBacktest(job.request);
    await writeManifest(result);
    logger.info("Manifest written", { runId: job.runId });
  } catch (error) {
    logger.error("Failed to process run", {
      runId: job.runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

onJob((job: QueueJob) => {
  void handleJob(job);
});

logger.info("Backtest worker ready");
