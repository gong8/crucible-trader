import { strict as assert } from "node:assert";
import test from "node:test";
import { JobQueue, type QueueJob, type JobHandler } from "../src/queue.js";
import { createApiDatabase } from "../src/db/index.js";
import type { BacktestRequest } from "@crucible-trader/sdk";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createTestRequest = (): BacktestRequest => ({
  runName: "test-run",
  data: [
    {
      source: "csv",
      symbol: "AAPL",
      timeframe: "1d",
      start: "2024-01-01",
      end: "2024-12-31",
    },
  ],
  strategy: {
    name: "sma_crossover",
    params: { fastLength: 10, slowLength: 20 },
  },
  costs: { feeBps: 1, slippageBps: 2 },
  initialCash: 100_000,
});

test("JobQueue can be instantiated with database", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const queue = new JobQueue({ database: db });
  assert.ok(queue);
  queue.stop();
});

test("JobQueue accepts custom poll interval", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const queue = new JobQueue({ database: db, pollIntervalMs: 500 });
  assert.ok(queue);
  queue.stop();
});

test("JobQueue.onJob registers handler and starts polling", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db, pollIntervalMs: 100 });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  let handlerCalled = false;
  const handler: JobHandler = async () => {
    handlerCalled = true;
  };

  queue.onJob(handler);

  // Create a job
  await db.insertRun({
    runId: "test-1",
    name: "Test Run",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(createTestRequest()),
  });

  // Wait for handler to be called
  await delay(200);

  assert.ok(handlerCalled, "handler should be called");
});

test("JobQueue processes queued jobs", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const queue = new JobQueue({ database: db, pollIntervalMs: 50 });
  t.after(() => {
    queue.stop();
  });

  const processedJobs: QueueJob[] = [];
  const handler: JobHandler = async (job) => {
    processedJobs.push(job);
  };

  queue.onJob(handler);

  // Create multiple jobs
  const request = createTestRequest();
  await db.insertRun({
    runId: "test-1",
    name: "Test 1",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(request),
  });

  await db.insertRun({
    runId: "test-2",
    name: "Test 2",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(request),
  });

  // Wait for jobs to be processed
  await delay(200);

  assert.ok(processedJobs.length >= 1, "at least one job should be processed");
  assert.equal(processedJobs[0]?.runId, "test-1");
});

test("JobQueue.stop stops polling", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const queue = new JobQueue({ database: db, pollIntervalMs: 50 });

  let callCount = 0;
  const handler: JobHandler = async () => {
    callCount++;
  };

  queue.onJob(handler);

  // Create a job
  await db.insertRun({
    runId: "test-1",
    name: "Test",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await delay(100);
  const countAfterFirstPeriod = callCount;

  queue.stop();

  // Create another job after stopping
  await db.insertRun({
    runId: "test-2",
    name: "Test 2",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await delay(100);

  // Count should not increase after stop
  assert.equal(callCount, countAfterFirstPeriod, "polling should stop");
});

test("JobQueue updates job status to processing", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const queue = new JobQueue({ database: db, pollIntervalMs: 50 });
  t.after(() => {
    queue.stop();
  });

  const jobProcessed = new Promise<void>((resolve) => {
    queue.onJob(async () => {
      resolve();
    });
  });

  await db.insertRun({
    runId: "test-1",
    name: "Test",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await jobProcessed;

  const run = await db.getRun("test-1");
  // Status should be processing or completed
  assert.ok(run?.status === "processing" || run?.status === "completed");
});

test("JobQueue handles handler errors gracefully", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const queue = new JobQueue({ database: db, pollIntervalMs: 50 });
  t.after(() => {
    queue.stop();
  });

  const jobProcessed = new Promise<void>((resolve) => {
    queue.onJob(async () => {
      resolve();
      throw new Error("Handler error");
    });
  });

  await db.insertRun({
    runId: "test-1",
    name: "Test",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await jobProcessed;
  await delay(50);

  const run = await db.getRun("test-1");
  assert.equal(run?.status, "failed", "job should be marked as failed");
});

test("JobQueue handles invalid JSON in requestJson", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const queue = new JobQueue({ database: db, pollIntervalMs: 50 });
  t.after(() => {
    queue.stop();
  });

  let handlerCalled = false;
  queue.onJob(async () => {
    handlerCalled = true;
  });

  await db.insertRun({
    runId: "test-1",
    name: "Test",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: "invalid json",
  });

  await delay(100);

  const run = await db.getRun("test-1");
  assert.equal(run?.status, "failed", "job should be marked as failed for invalid JSON");
  assert.equal(handlerCalled, false, "handler should not be called for invalid JSON");
});

test("JobQueue supports multiple handlers", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db, pollIntervalMs: 50 });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  let handler1Called = false;
  let handler2Called = false;

  queue.onJob(async () => {
    handler1Called = true;
  });

  queue.onJob(async () => {
    handler2Called = true;
  });

  await db.insertRun({
    runId: "test-1",
    name: "Test",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await delay(100);

  assert.ok(handler1Called, "first handler should be called");
  assert.ok(handler2Called, "second handler should be called");
});

test("JobQueue.enqueue triggers immediate poll", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const queue = new JobQueue({ database: db, pollIntervalMs: 10000 }); // Long interval
  t.after(() => {
    queue.stop();
  });

  const jobProcessed = new Promise<void>((resolve) => {
    queue.onJob(async () => {
      resolve();
    });
  });

  await db.insertRun({
    runId: "test-1",
    name: "Test",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(createTestRequest()),
  });

  const job: QueueJob = {
    runId: "test-1",
    request: createTestRequest(),
  };

  await queue.enqueue(job);

  // Should process quickly despite long poll interval
  await Promise.race([
    jobProcessed,
    delay(1000).then(() => {
      throw new Error("Job not processed within 1s");
    }),
  ]);

  assert.ok(true, "job was processed quickly");
});

test("JobQueue does not process same job twice", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db, pollIntervalMs: 25 });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const processedRunIds: string[] = [];
  queue.onJob(async (job) => {
    processedRunIds.push(job.runId);
    await delay(50); // Simulate slow processing
  });

  await db.insertRun({
    runId: "test-1",
    name: "Test",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await delay(200);

  // Filter to unique run IDs
  const uniqueRunIds = [...new Set(processedRunIds)];
  assert.equal(uniqueRunIds.length, processedRunIds.length, "no duplicate processing");
});

test("JobQueue ignores jobs with status other than queued", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db, pollIntervalMs: 50 });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const processedRunIds: string[] = [];
  queue.onJob(async (job) => {
    processedRunIds.push(job.runId);
  });

  await db.insertRun({
    runId: "test-1",
    name: "Completed",
    createdAt: new Date().toISOString(),
    status: "completed",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await db.insertRun({
    runId: "test-2",
    name: "Failed",
    createdAt: new Date().toISOString(),
    status: "failed",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await db.insertRun({
    runId: "test-3",
    name: "Processing",
    createdAt: new Date().toISOString(),
    status: "processing",
    requestJson: JSON.stringify(createTestRequest()),
  });

  await delay(150);

  assert.equal(processedRunIds.length, 0, "non-queued jobs should be ignored");
});

test("JobQueue processes jobs in order", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db, pollIntervalMs: 25 });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const processedOrder: string[] = [];
  queue.onJob(async (job) => {
    processedOrder.push(job.runId);
    await delay(30);
  });

  const request = createTestRequest();

  // Insert jobs in specific order
  await db.insertRun({
    runId: "job-1",
    name: "First",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(request),
  });

  await delay(10);

  await db.insertRun({
    runId: "job-2",
    name: "Second",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(request),
  });

  await delay(10);

  await db.insertRun({
    runId: "job-3",
    name: "Third",
    createdAt: new Date().toISOString(),
    status: "queued",
    requestJson: JSON.stringify(request),
  });

  await delay(300);

  assert.ok(processedOrder.length >= 2, "multiple jobs processed");
  // First job should be processed first
  assert.equal(processedOrder[0], "job-1");
});
