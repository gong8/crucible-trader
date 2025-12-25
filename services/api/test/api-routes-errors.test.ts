import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiDatabase } from "../src/db/index.js";
import { createFastifyServer } from "../src/server.js";
import { JobQueue } from "../src/queue.js";

// ============================================================================
// API Routes Error Handling Tests
// ============================================================================

test("POST /api/runs rejects invalid payload", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "api-invalid-"));
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  const app = await createFastifyServer({ database: db, queue });

  const invalidPayload = {
    // Missing required fields
    runName: "test",
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: invalidPayload,
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.ok(body.message);
  assert.ok(body.message.includes("Invalid BacktestRequest"));
});

test("POST /api/runs rejects empty runName", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.ok(body.message.includes("Invalid BacktestRequest"));
});

test("POST /api/runs rejects empty data array", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
});

test("POST /api/runs rejects negative costs", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: -1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
});

test("POST /api/runs rejects zero or negative initial cash", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 0,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
});

test("POST /api/runs rejects invalid source", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [
      {
        source: "invalid_source",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
});

test("POST /api/runs rejects invalid timeframe", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "5m",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
});

test("POST /api/runs rejects unknown risk profile", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
    riskProfileId: "nonexistent",
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.ok(body.message.includes("Unknown risk profile"));
});

test("GET /api/runs/:id returns 404 for nonexistent run", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const response = await app.inject({
    method: "GET",
    url: "/api/runs/nonexistent-run-id",
  });

  assert.equal(response.statusCode, 404);
  const body = response.json();
  assert.ok(body.message.includes("not found"));
});

test("GET /api/runs/:id returns error details for failed run", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  // Create a failed run
  await db.insertRun({
    runId: "failed-run",
    name: "Failed Test",
    createdAt: new Date().toISOString(),
    status: "failed",
    requestJson: JSON.stringify({ runName: "Failed Test" }),
    errorMessage: "Strategy execution failed",
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/runs/failed-run",
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.status, "failed");
  assert.ok(body.message.includes("failed"));
});

test("GET /api/runs/:id/artifacts/:artifact returns 404 for missing artifact", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  // Create a run without actually running it
  await db.insertRun({
    runId: "no-artifact-run",
    name: "No Artifact",
    createdAt: new Date().toISOString(),
    status: "completed",
    requestJson: JSON.stringify({ runName: "No Artifact" }),
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/runs/no-artifact-run/artifacts/equity",
  });

  assert.equal(response.statusCode, 404);
});

test("GET /api/runs/:id/equity returns 404 for nonexistent run", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const response = await app.inject({
    method: "GET",
    url: "/api/runs/nonexistent/equity",
  });

  assert.equal(response.statusCode, 404);
});

test("GET /api/runs/:id/trades returns 404 for nonexistent run", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const response = await app.inject({
    method: "GET",
    url: "/api/runs/nonexistent/trades",
  });

  assert.equal(response.statusCode, 404);
});

test("GET /api/runs/:id/bars returns 404 for nonexistent run", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const response = await app.inject({
    method: "GET",
    url: "/api/runs/nonexistent/bars",
  });

  assert.equal(response.statusCode, 404);
});

test("GET /api/runs returns empty array when no runs exist", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const response = await app.inject({
    method: "GET",
    url: "/api/runs",
  });

  assert.equal(response.statusCode, 200);
  const runs = response.json();
  assert.ok(Array.isArray(runs));
  assert.equal(runs.length, 0);
});

test("POST /api/runs/reset clears all runs", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  // Create a run
  await db.insertRun({
    runId: "test-run",
    name: "Test",
    createdAt: new Date().toISOString(),
    status: "completed",
    requestJson: JSON.stringify({ runName: "Test" }),
  });

  // Verify run exists
  const before = await app.inject({
    method: "GET",
    url: "/api/runs",
  });
  assert.ok(before.json().length > 0);

  // Reset
  const resetResponse = await app.inject({
    method: "POST",
    url: "/api/runs/reset",
  });

  assert.equal(resetResponse.statusCode, 204);

  // Verify runs are cleared
  const after = await app.inject({
    method: "GET",
    url: "/api/runs",
  });
  assert.equal(after.json().length, 0);
});

test("POST /api/runs with missing strategy name", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "",
      params: {},
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
});

test("POST /api/runs validates metric names", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "AAPL",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
    metrics: ["invalid_metric"],
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
});

test("POST /api/runs handles missing symbol", async (t) => {
  const db = await createApiDatabase({ filename: ":memory:" });
  const queue = new JobQueue({ database: db });

  t.after(async () => {
    queue.stop();
    await db.close();
  });

  const app = await createFastifyServer({ database: db, queue });

  const payload = {
    runName: "test",
    data: [
      {
        source: "csv",
        symbol: "",
        timeframe: "1d",
        start: "2024-01-01",
        end: "2024-01-10",
      },
    ],
    strategy: {
      name: "sma_crossover",
      params: { fastLength: 10, slowLength: 20 },
    },
    costs: { feeBps: 1, slippageBps: 2 },
    initialCash: 100_000,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload,
  });

  assert.equal(response.statusCode, 400);
});
