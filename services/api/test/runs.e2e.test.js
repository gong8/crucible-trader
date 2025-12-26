import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runBacktest } from "@crucible-trader/engine";

import { createApiDatabase } from "../dist/db/index.js";
import { createFastifyServer } from "../dist/server.js";
import { JobQueue } from "../dist/queue.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(TEST_DIR, "..", "..", "..");
const RUNS_ROOT = join(REPO_ROOT, "storage", "runs");
const DATASETS_ROOT = join(REPO_ROOT, "storage", "datasets");
const MSFT_DATASET = join(DATASETS_ROOT, "msft_1h.csv");
const DATASET_CONTENT = `timestamp,open,high,low,close,volume
2024-02-01T14:30:00.000Z,403.2,404.1,402.75,403.85,215000
2024-02-01T15:30:00.000Z,403.9,405.25,403.1,404.95,198500
2024-02-01T16:30:00.000Z,404.8,406.4,404.2,405.75,225300
2024-02-01T17:30:00.000Z,405.6,406.05,404.5,404.88,187900
2024-02-01T18:30:00.000Z,404.9,405.55,403.8,404.1,176400
2024-02-01T19:30:00.000Z,404.15,405,403.25,404.72,189050
2024-02-01T20:30:00.000Z,404.8,406.2,404.5,405.95,210600
2024-02-01T21:30:00.000Z,406,406.75,405.3,406.42,202775
2024-02-02T14:30:00.000Z,407.1,408,406.4,407.75,198000
`;

test("POST /api/runs executes a backtest end-to-end", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "api-e2e-"));
  const dbPath = join(tempDir, "api.sqlite");
  const database = await createApiDatabase({ filename: dbPath });
  const queue = new JobQueue({ database, pollIntervalMs: 25 });
  const runDirs = [];

  const jobProcessed = new Promise((resolve) => {
    queue.onJob(async (job) => {
      const result = await runBacktest(job.request, { runId: job.runId });
      await database.saveRunResult(result);
      await database.updateRunStatus(job.runId, "completed");
      const runDir = join(RUNS_ROOT, job.runId);
      runDirs.push(runDir);
      await mkdir(runDir, { recursive: true });
      await writeFile(
        join(runDir, "manifest.json"),
        JSON.stringify(
          {
            runId: result.runId,
            summary: result.summary,
            artifacts: result.artifacts,
            datasets: job.request.data,
            engine: { version: "0.0.1", seed: 42 },
            metadata: {
              name: job.request.runName,
              createdAt: new Date().toISOString(),
              status: "completed",
            },
          },
          null,
          2,
        ),
        { encoding: "utf-8" },
      );
      resolve();
    });
  });

  const app = await createFastifyServer({ database, queue });
  await ensureMsftDataset();

  t.after(async () => {
    queue.stop();
    await app.close();
    await database.close();
    await Promise.all(runDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    await rm(tempDir, { recursive: true, force: true });
    await rm(MSFT_DATASET, { force: true });
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      runName: "msft_hourly_demo",
      data: [
        {
          source: "csv",
          symbol: "MSFT",
          timeframe: "1h",
          start: "2024-02-01",
          end: "2024-02-02",
          adjusted: true,
        },
      ],
      strategy: {
        name: "sma_crossover",
        params: { fastLength: 2, slowLength: 3 },
      },
      costs: { feeBps: 1, slippageBps: 1 },
      initialCash: 100000,
      seed: 42,
    },
  });

  assert.equal(response.statusCode, 201);
  const payload = response.json();
  await jobProcessed;

  let result = null;
  for (let i = 0; i < 5; i += 1) {
    const poll = await app.inject({ method: "GET", url: `/api/runs/${payload.runId}` });
    if (poll.statusCode === 200) {
      result = poll.json();
      break;
    }
    await delay(50);
  }

  assert.ok(result, "run result should be available");
  assert.equal(result?.runId, payload.runId);
});

const ensureMsftDataset = async () => {
  await mkdir(DATASETS_ROOT, { recursive: true });
  await writeFile(MSFT_DATASET, DATASET_CONTENT, { encoding: "utf-8" });
};
