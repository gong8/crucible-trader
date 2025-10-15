import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BacktestResult } from "@crucible-trader/sdk";

import { runBacktest } from "@crucible-trader/engine";
import { onJob, type QueueJob } from "@crucible-trader/api/queue";

const STORAGE_ROOT = "storage";
const RUNS_DIR = join(STORAGE_ROOT, "runs");

interface Manifest {
  readonly runId: string;
  readonly summary: BacktestResult["summary"];
  readonly artifacts: BacktestResult["artifacts"];
  readonly engine: {
    readonly version: string;
    readonly seed: number;
  };
}

const log = (level: string, msg: string, meta: Record<string, unknown> = {}): void => {
  const entry = {
    ts: new Date().toISOString(),
    module: "services/backtest-worker",
    level,
    msg,
    ...meta,
  };
  console.info(JSON.stringify(entry));
};

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
  log("info", "Processing run", { runId: job.runId });

  try {
    const result = await runBacktest(job.request);
    await writeManifest(result);
    log("info", "Manifest written", { runId: job.runId });
  } catch (error) {
    log("error", "Failed to process run", {
      runId: job.runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

onJob((job: QueueJob) => {
  void handleJob(job);
});

log("info", "Backtest worker ready");
