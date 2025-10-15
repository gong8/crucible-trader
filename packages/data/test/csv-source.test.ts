import { strict as assert } from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { DataRequest } from "@crucible-trader/sdk";

import { CsvSource } from "../src/CsvSource.js";

const SAMPLE_CSV = `timestamp,open,high,low,close,volume\n` +
  `2024-01-02T00:00:00.000Z,180.0,182.0,179.5,181.0,1000\n` +
  `2024-01-03T00:00:00.000Z,181.0,183.0,180.5,182.0,1200\n` +
  `2024-01-02T00:00:00.000Z,180.0,182.0,179.5,181.0,1000\n` +
  `2024-01-05T00:00:00.000Z,183.0,185.0,182.5,184.0,1500\n` +
  `2024-01-04T00:00:00.000Z,182.0,184.0,181.5,183.0,1400`;

test("CsvSource loads, dedupes, sorts, and caches bars", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "csv-source-"));
  const datasetsDir = tempRoot;
  const cacheDir = join(tempRoot, ".cache");
  const datasetPath = join(datasetsDir, "aapl_1d.csv");

  await writeFile(datasetPath, SAMPLE_CSV, { encoding: "utf-8" });

  const source = new CsvSource({ datasetsDir, cacheDir });

  const request: DataRequest = {
    source: "csv",
    symbol: "AAPL",
    timeframe: "1d",
    start: "2024-01-02T00:00:00.000Z",
    end: "2024-01-06T00:00:00.000Z",
  };

  const result = await source.loadBars(request);
  assert.equal(result.length, 4, "should return deduped bars");
  assert.deepEqual(
    result.map((bar) => bar.timestamp),
    [
      "2024-01-02T00:00:00.000Z",
      "2024-01-03T00:00:00.000Z",
      "2024-01-04T00:00:00.000Z",
      "2024-01-05T00:00:00.000Z",
    ],
    "should be sorted by timestamp",
  );

  // Modify request range to ensure filtering is applied from cached payload.
  const cachedResult = await source.loadBars({
    ...request,
    start: "2024-01-03T00:00:00.000Z",
  });
  assert.equal(cachedResult.length, 3, "cache should reuse parsed data with range filtering");
  assert.equal(cachedResult[0]?.timestamp, "2024-01-03T00:00:00.000Z");

  const cachePath = join(cacheDir, "aapl_1d.json");
  const cacheContent = JSON.parse(await readFile(cachePath, { encoding: "utf-8" }));
  assert.equal(cacheContent.bars.length, 4, "cache stores full bar set");

  await t.test("Cache invalidates after dataset change", async () => {
    await writeFile(datasetPath, `${SAMPLE_CSV}\n2024-01-06T00:00:00.000Z,184,186,183.5,185,1600`, {
      encoding: "utf-8",
    });

    const updated = await source.loadBars(request);
    assert.equal(updated.length, 5, "cache invalidated after dataset mtime change");
  });
});
