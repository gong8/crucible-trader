import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { BacktestRequest, BacktestResult, RiskProfile } from "@crucible-trader/sdk";
import type { Logger } from "@crucible-trader/logger";
import { createJobHandler, createManifestWriter } from "../src/index.js";
import type { QueueJob } from "../../api/dist/queue.js";
import type { RunBacktestOptions } from "@crucible-trader/engine";

type WorkerDeps = Parameters<typeof createJobHandler>[0];
type WorkerDatabase = WorkerDeps["database"];
type RunBacktestMock = WorkerDeps["runBacktest"];

interface TestJob {
  readonly runId: string;
  readonly request: BacktestRequest;
}

const baseRequest = (): BacktestRequest => ({
  runName: "test_run",
  data: [
    {
      source: "csv",
      symbol: "AAPL",
      timeframe: "1d",
      start: "2023-01-01",
      end: "2023-12-31",
      adjusted: true,
    },
    {
      source: "tiingo",
      symbol: "MSFT",
      timeframe: "1h",
      start: "2023-06-01",
      end: "2023-07-01",
    },
  ],
  strategy: {
    name: "sma_crossover",
    params: { fastLength: 5, slowLength: 15 },
  },
  costs: {
    feeBps: 1,
    slippageBps: 2,
  },
  initialCash: 100000,
  seed: 42,
  metrics: ["sharpe", "max_dd"],
});

const baseResult = (overrides?: Partial<BacktestResult>): BacktestResult => ({
  runId: "run-123",
  summary: { sharpe: 1.23, max_dd: -0.12 },
  artifacts: {
    equityParquet: "/tmp/equity.parquet",
    tradesParquet: "/tmp/trades.parquet",
    barsParquet: "/tmp/bars.parquet",
    ...overrides?.artifacts,
  },
  diagnostics: {
    seed: 84,
    ...overrides?.diagnostics,
  },
  ...overrides,
});

const createTestLogger = () => {
  const infoMessages: Array<[string, Record<string, unknown>?]> = [];
  const errorMessages: Array<[string, Record<string, unknown>?]> = [];
  const logger: Logger = {
    module: "test",
    log: () => {},
    debug: () => {},
    info: (msg, meta) => {
      infoMessages.push([msg, meta]);
    },
    warn: () => {},
    error: (msg, meta) => {
      errorMessages.push([msg, meta]);
    },
  };
  return { logger, infoMessages, errorMessages };
};

const buildRiskProfile = (id: string): RiskProfile => ({
  id,
  name: `${id}-profile`,
  maxDailyLossPct: 0.01,
  maxPositionPct: 0.2,
  perOrderCapPct: 0.05,
  globalDDKillPct: 0.04,
  cooldownMinutes: 10,
});

test("createManifestWriter writes manifest with defaults and dataset metadata", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "worker-manifest-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const writer = createManifestWriter({
    runsDir: tempDir,
    now: () => new Date("2024-05-01T00:00:00Z"),
  });
  const result = baseResult({ runId: "run-abc", diagnostics: { seed: 7 } });

  await writer(result, undefined, [
    { symbol: "AAPL", timeframe: "1d", source: "csv", start: "2024-01-01", end: "2024-05-01" },
  ]);

  const manifestPath = join(tempDir, "run-abc", "manifest.json");
  const manifestJson = JSON.parse(await readFile(manifestPath, "utf-8"));

  assert.equal(manifestJson.runId, "run-abc");
  assert.deepEqual(manifestJson.summary, result.summary);
  assert.equal(
    manifestJson.artifacts.reportMd,
    join(tempDir, "run-abc", "report.md"),
    "report path should default to run directory",
  );
  assert.equal(manifestJson.engine.seed, 7);
  assert.deepEqual(manifestJson.datasets, [
    {
      symbol: "AAPL",
      timeframe: "1d",
      source: "csv",
      start: "2024-01-01",
      end: "2024-05-01",
    },
  ]);
  assert.equal("adjusted" in manifestJson.datasets[0], false);
  assert.equal(manifestJson.metadata.createdAt, "2024-05-01T00:00:00.000Z");
  assert.equal(manifestJson.metadata.status, "completed");
});

test("createManifestWriter keeps explicit report path and metadata", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "worker-manifest-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const writer = createManifestWriter({ runsDir: tempDir });
  const result = baseResult({
    runId: "run-has-report",
    artifacts: {
      equityParquet: "/eq",
      tradesParquet: "/tr",
      barsParquet: "/br",
      reportMd: "/custom/report.md",
    },
  });

  await writer(
    result,
    { name: "Custom Run", createdAt: "2024-01-01T00:00:00.000Z", status: "archived" },
    [],
  );

  const manifestPath = join(tempDir, "run-has-report", "manifest.json");
  const manifestJson = JSON.parse(await readFile(manifestPath, "utf-8"));

  assert.equal(manifestJson.artifacts.reportMd, "/custom/report.md");
  assert.equal(manifestJson.metadata.name, "Custom Run");
  assert.equal(manifestJson.metadata.status, "archived");
});

test("createJobHandler processes job successfully and persists result", async () => {
  const request = { ...baseRequest(), riskProfileId: "guard-1" };
  const job: TestJob = { runId: "run-success", request };

  const savedResults: BacktestResult[] = [];
  const statusUpdates: Array<{ runId: string; status: string; errorMessage?: string }> = [];
  let fetchedRiskProfile: string | undefined;
  const resolvedProfile = buildRiskProfile("guard-1");

  const database: WorkerDatabase = {
    getRiskProfileById: async (riskProfileId: string) => {
      fetchedRiskProfile = riskProfileId;
      return resolvedProfile;
    },
    saveRunResult: async (result: BacktestResult) => {
      savedResults.push(result);
    },
    updateRunStatus: async (runId: string, status: string, errorMessage?: string) => {
      statusUpdates.push({ runId, status, errorMessage });
    },
  };

  const manifestCalls: unknown[] = [];
  const writeManifest = async (...args: unknown[]) => {
    manifestCalls.push(args);
  };

  const backtestCalls: Array<{ request: BacktestRequest; options?: RunBacktestOptions }> = [];
  const runBacktest: RunBacktestMock = async (
    btRequest: BacktestRequest,
    options?: RunBacktestOptions,
  ): Promise<BacktestResult> => {
    backtestCalls.push({ request: btRequest, options });
    return baseResult({ runId: job.runId });
  };

  const { logger, errorMessages } = createTestLogger();

  const handler = createJobHandler({
    database,
    runBacktest,
    logger,
    writeManifest,
    now: () => new Date("2024-02-01T12:34:56Z"),
  });

  await handler(job as QueueJob);

  assert.equal(fetchedRiskProfile, "guard-1");
  assert.equal(backtestCalls.length, 1);
  assert.equal(backtestCalls[0]?.options?.runId, "run-success");
  assert.deepEqual(backtestCalls[0]?.request, request);
  assert.deepEqual(backtestCalls[0]?.options?.riskProfile, resolvedProfile);

  assert.equal(manifestCalls.length, 1);
  const [, metadata, datasets] = manifestCalls[0] as [
    BacktestResult,
    { name: string; createdAt: string; status: string },
    Array<Record<string, unknown>>,
  ];
  assert.deepEqual(metadata, {
    name: "test_run",
    createdAt: "2024-02-01T12:34:56.000Z",
    status: "completed",
  });
  assert.deepEqual(datasets, [
    {
      symbol: "AAPL",
      timeframe: "1d",
      source: "csv",
      start: "2023-01-01",
      end: "2023-12-31",
      adjusted: true,
    },
    {
      symbol: "MSFT",
      timeframe: "1h",
      source: "tiingo",
      start: "2023-06-01",
      end: "2023-07-01",
      adjusted: undefined,
    },
  ]);

  assert.equal(savedResults.length, 1);
  assert.equal(savedResults[0]?.runId, "run-success");

  assert.deepEqual(statusUpdates, [
    { runId: "run-success", status: "completed", errorMessage: undefined },
  ]);
  assert.equal(errorMessages.length, 0);
});

test("createJobHandler skips risk profile lookup when not provided", async () => {
  const job: TestJob = { runId: "run-norp", request: baseRequest() };
  let riskLookupCount = 0;

  const database: WorkerDatabase = {
    getRiskProfileById: async () => {
      riskLookupCount += 1;
      return undefined;
    },
    saveRunResult: async () => {},
    updateRunStatus: async () => {},
  };

  const handler = createJobHandler({
    database,
    runBacktest: (async () => baseResult({ runId: job.runId })) as RunBacktestMock,
    logger: createTestLogger().logger,
    writeManifest: async () => {},
  });

  await handler(job as QueueJob);
  assert.equal(riskLookupCount, 0);
});

test("createJobHandler marks runs as failed when runBacktest throws", async () => {
  const job: TestJob = { runId: "run-error", request: baseRequest() };
  const statusUpdates: Array<{ runId: string; status: string; errorMessage?: string }> = [];

  const database: WorkerDatabase = {
    getRiskProfileById: async () => undefined,
    saveRunResult: async () => {
      throw new Error("should not save on failure");
    },
    updateRunStatus: async (runId: string, status: string, errorMessage?: string) => {
      statusUpdates.push({ runId, status, errorMessage });
    },
  };

  const { logger, errorMessages } = createTestLogger();
  const handler = createJobHandler({
    database,
    runBacktest: (async () => {
      throw new Error("engine failure");
    }) as RunBacktestMock,
    logger,
    writeManifest: async () => {
      throw new Error("should not write manifest on failure");
    },
  });

  await assert.rejects(() => handler(job as QueueJob), /engine failure/);

  assert.deepEqual(statusUpdates, [
    { runId: "run-error", status: "failed", errorMessage: "engine failure" },
  ]);
  assert.equal(errorMessages.length, 1);
});
