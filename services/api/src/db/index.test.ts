import assert from "node:assert/strict";
import test from "node:test";

import type { BacktestResult, RiskProfile } from "@crucible-trader/sdk";

const loadDatabase = async () => {
  try {
    const module = await import("./index.js");
    return module.createApiDatabase;
  } catch (error) {
    console.error("failed to import createApiDatabase", error);
    throw error;
  }
};

test("insertRun persists metadata and listRuns returns it", async (t) => {
  const createApiDatabase = await loadDatabase();
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const createdAt = new Date().toISOString();
  await db.insertRun({
    runId: "run-1",
    name: "Sample Run",
    createdAt,
    status: "queued",
    requestJson: JSON.stringify({ runName: "Sample Run" }),
  });

  const runs = await db.listRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.runId, "run-1");
  assert.equal(runs[0]?.name, "Sample Run");
  assert.equal(runs[0]?.status, "queued");
  assert.equal(runs[0]?.createdAt, createdAt);
  assert.equal(runs[0]?.summaryJson, null);
});

test("saveRunResult stores summary and artifacts for later retrieval", async (t) => {
  const createApiDatabase = await loadDatabase();
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const createdAt = new Date().toISOString();
  await db.insertRun({
    runId: "run-2",
    name: "Result Run",
    createdAt,
    status: "queued",
    requestJson: JSON.stringify({ runName: "Result Run" }),
  });

  const result: BacktestResult = {
    runId: "run-2",
    summary: { sharpe: 1.2, cagr: 0.15 },
    artifacts: {
      equityParquet: "storage/runs/run-2/equity.parquet",
      tradesParquet: "storage/runs/run-2/trades.parquet",
      barsParquet: "storage/runs/run-2/bars.parquet",
      reportMd: "storage/runs/run-2/report.md",
    },
    diagnostics: { engineVersion: "0.0.1" },
  };

  await db.saveRunResult(result);

  const run = await db.getRun("run-2");
  assert(run, "run should exist after saving result");
  assert.equal(run?.status, "completed");
  assert(run?.summaryJson, "summary_json should be populated");
  assert.deepEqual(JSON.parse(run?.summaryJson ?? "{}"), result.summary);

  const artifacts = await db.getArtifacts("run-2");
  assert.equal(artifacts.length, 4);
  const kinds = artifacts.map((artifact) => artifact.kind).sort();
  assert.deepEqual(kinds, ["bars", "equity", "report", "trades"]);
  const report = artifacts.find((artifact) => artifact.kind === "report");
  assert(report);
  assert.equal(report?.path, "storage/runs/run-2/report.md");
});

test("reset clears runs and artifacts tables", async (t) => {
  const createApiDatabase = await loadDatabase();
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const createdAt = new Date().toISOString();
  await db.insertRun({
    runId: "run-3",
    name: "Resettable Run",
    createdAt,
    status: "queued",
    requestJson: JSON.stringify({ runName: "Resettable Run" }),
  });

  await db.saveRunResult({
    runId: "run-3",
    summary: { sharpe: 1.0 },
    artifacts: {
      equityParquet: "storage/runs/run-3/equity.parquet",
      tradesParquet: "storage/runs/run-3/trades.parquet",
      barsParquet: "storage/runs/run-3/bars.parquet",
    },
    diagnostics: {},
  });

  await db.reset();

  const runs = await db.listRuns();
  assert.equal(runs.length, 0);

  const artifacts = await db.getArtifacts("run-3");
  assert.equal(artifacts.length, 0);
});

test("upsertDataset persists metadata", async (t) => {
  const createApiDatabase = await loadDatabase();
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  await db.upsertDataset({
    source: "csv",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-01",
    end: "2024-01-10",
    adjusted: true,
    path: "storage/datasets/aapl_1d.csv",
    checksum: null,
    rows: 10,
    createdAt: new Date().toISOString(),
  });

  const datasets = await db.listDatasets();
  assert.equal(datasets.length, 1);
  const record = datasets[0];
  assert(record);
  assert.equal(record.symbol, "AAPL");
  assert.equal(record.timeframe, "1d");
  assert.equal(record.rows, 10);
});

test("risk profiles can be stored and retrieved", async (t) => {
  const createApiDatabase = await loadDatabase();
  const db = await createApiDatabase({ filename: ":memory:" });
  t.after(async () => {
    await db.close();
  });

  const profile: RiskProfile = {
    id: "custom",
    name: "Custom Profile",
    maxDailyLossPct: 0.05,
    maxPositionPct: 0.3,
    perOrderCapPct: 0.15,
    globalDDKillPct: 0.08,
    cooldownMinutes: 30,
  };

  await db.upsertRiskProfile(profile);

  const fetched = await db.getRiskProfileById("custom");
  assert(fetched);
  assert.equal(fetched.name, profile.name);

  const profiles = await db.listRiskProfiles();
  assert.ok(profiles.some((entry) => entry.id === "custom"));
});
