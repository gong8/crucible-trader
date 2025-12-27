import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdir, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  writeParquetArtifacts,
  writeReportArtifact,
  type EquityRow,
  type ParquetArtifactInput,
} from "../src/persistence.js";
import type { ReportPayload } from "../src/report.js";

// Helper to create a temp directory for each test
async function createTempRunDir(): Promise<string> {
  const tempDir = join(tmpdir(), `crucible-test-run-${Date.now()}-${Math.random()}`);
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

// ============================================================================
// writeParquetArtifacts - Basic Functionality Tests
// ============================================================================

test("writeParquetArtifacts creates all three parquet files", async () => {
  const runDir = await createTempRunDir();

  try {
    const input: ParquetArtifactInput = {
      equity: [
        { time: "2024-01-01T00:00:00.000Z", equity: 100000 },
        { time: "2024-01-02T00:00:00.000Z", equity: 101000 },
      ],
      trades: [
        {
          time: "2024-01-01T10:00:00.000Z",
          side: "buy",
          qty: 100,
          price: 50.5,
          pnl: 0,
          fees: 1.5,
          reason: "entry_signal",
        },
      ],
      bars: [
        {
          time: "2024-01-01T00:00:00.000Z",
          open: 50,
          high: 52,
          low: 49,
          close: 51,
          volume: 10000,
        },
      ],
    };

    await writeParquetArtifacts(runDir, input);

    const files = await readdir(runDir);
    assert.ok(files.includes("equity.parquet"));
    assert.ok(files.includes("trades.parquet"));
    assert.ok(files.includes("bars.parquet"));

    // Verify files are not empty
    const equityStat = await stat(join(runDir, "equity.parquet"));
    const tradesStat = await stat(join(runDir, "trades.parquet"));
    const barsStat = await stat(join(runDir, "bars.parquet"));

    assert.ok(equityStat.size > 0);
    assert.ok(tradesStat.size > 0);
    assert.ok(barsStat.size > 0);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

// ============================================================================
// writeParquetArtifacts - Empty Data Tests (Critical Edge Case)
// ============================================================================

test("writeParquetArtifacts handles empty equity array", async () => {
  const runDir = await createTempRunDir();

  try {
    const input: ParquetArtifactInput = {
      equity: [], // Empty!
      trades: [
        {
          time: "2024-01-01T10:00:00.000Z",
          side: "buy",
          qty: 100,
          price: 50,
          pnl: 0,
          fees: 1,
          reason: "test",
        },
      ],
      bars: [
        {
          time: "2024-01-01T00:00:00.000Z",
          open: 50,
          high: 50,
          low: 50,
          close: 50,
          volume: 100,
        },
      ],
    };

    await writeParquetArtifacts(runDir, input);

    // Should write a placeholder row
    const files = await readdir(runDir);
    assert.ok(files.includes("equity.parquet"));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("writeParquetArtifacts handles all empty arrays", async () => {
  const runDir = await createTempRunDir();

  try {
    const input: ParquetArtifactInput = {
      equity: [],
      trades: [],
      bars: [],
    };

    await writeParquetArtifacts(runDir, input);

    // All files should exist with placeholder rows
    const files = await readdir(runDir);
    assert.equal(files.length, 3);
    assert.ok(files.includes("equity.parquet"));
    assert.ok(files.includes("trades.parquet"));
    assert.ok(files.includes("bars.parquet"));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

// ============================================================================
// writeParquetArtifacts - Large Data Tests
// ============================================================================

test("writeParquetArtifacts handles large datasets", async () => {
  const runDir = await createTempRunDir();

  try {
    // Create 10,000 equity points
    const equity: EquityRow[] = Array.from({ length: 10000 }, (_, i) => ({
      time: new Date(Date.UTC(2024, 0, 1) + i * 60000).toISOString(),
      equity: 100000 + i * 10,
    }));

    const input: ParquetArtifactInput = {
      equity,
      trades: [],
      bars: [],
    };

    await writeParquetArtifacts(runDir, input);

    const files = await readdir(runDir);
    assert.ok(files.includes("equity.parquet"));

    // Verify file size increased significantly
    const equityStat = await stat(join(runDir, "equity.parquet"));
    assert.ok(equityStat.size > 10000); // At least 1 byte per row (very conservative)
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

// ============================================================================
// writeParquetArtifacts - Directory Creation Tests
// ============================================================================

test("writeParquetArtifacts creates directory if it doesn't exist", async () => {
  const baseDir = join(tmpdir(), `crucible-test-${Date.now()}`);
  const runDir = join(baseDir, "nested", "run", "dir");

  try {
    const input: ParquetArtifactInput = {
      equity: [{ time: "2024-01-01T00:00:00.000Z", equity: 100000 }],
      trades: [],
      bars: [],
    };

    await writeParquetArtifacts(runDir, input);

    const files = await readdir(runDir);
    assert.ok(files.includes("equity.parquet"));
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

// ============================================================================
// writeReportArtifact Tests
// ============================================================================

test("writeReportArtifact creates report.md file", async () => {
  const runDir = await createTempRunDir();

  try {
    const payload: ReportPayload = {
      runName: "test-run-123",
      summary: {
        sharpe: 1.5,
        sortino: 2.0,
        maxDrawdown: -0.02,
        cagr: 0.15,
        totalReturn: 0.05,
      },
      trades: [
        {
          id: "trade-1",
          symbol: "AAPL",
          timestamp: "2024-01-01T10:00:00.000Z",
          side: "buy",
          quantity: 100,
          price: 50,
          fees: 1.5,
          pnl: 150,
          reason: "test",
        },
      ],
      riskProfile: {
        id: "moderate",
        name: "Moderate Risk",
        maxDailyLossPct: 0.03,
        maxPositionPct: 0.2,
        perOrderCapPct: 0.1,
        globalDDKillPct: 0.05,
        cooldownMinutes: 60,
      },
    };

    await writeReportArtifact(runDir, payload);

    const files = await readdir(runDir);
    assert.ok(files.includes("report.md"));

    const reportStat = await stat(join(runDir, "report.md"));
    assert.ok(reportStat.size > 0);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("writeReportArtifact creates directory if it doesn't exist", async () => {
  const baseDir = join(tmpdir(), `crucible-test-${Date.now()}`);
  const runDir = join(baseDir, "report", "test");

  try {
    const payload: ReportPayload = {
      runName: "test-run-123",
      summary: { sharpe: 1.5 },
      trades: [],
      riskProfile: {
        id: "moderate",
        name: "Moderate Risk",
        maxDailyLossPct: 0.03,
        maxPositionPct: 0.2,
        perOrderCapPct: 0.1,
        globalDDKillPct: 0.05,
        cooldownMinutes: 60,
      },
    };

    await writeReportArtifact(runDir, payload);

    const files = await readdir(runDir);
    assert.ok(files.includes("report.md"));
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Concurrent Writes Test
// ============================================================================

test("writeParquetArtifacts handles concurrent writes", async () => {
  const runDir = await createTempRunDir();

  try {
    const input: ParquetArtifactInput = {
      equity: [{ time: "2024-01-01T00:00:00.000Z", equity: 100000 }],
      trades: [
        {
          time: "2024-01-01T10:00:00.000Z",
          side: "buy",
          qty: 100,
          price: 50,
          pnl: 0,
          fees: 1,
          reason: "test",
        },
      ],
      bars: [
        {
          time: "2024-01-01T00:00:00.000Z",
          open: 50,
          high: 50,
          low: 50,
          close: 50,
          volume: 100,
        },
      ],
    };

    // Write files - they're written in parallel using Promise.all internally
    await writeParquetArtifacts(runDir, input);

    const files = await readdir(runDir);
    assert.equal(files.length, 3);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});
