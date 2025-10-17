#!/usr/bin/env node

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");
const STORAGE_DIR = join(REPO_ROOT, "storage");
const RUNS_DIR = join(STORAGE_DIR, "runs");
const DB_FILES = ["api.sqlite", "api.sqlite-shm", "api.sqlite-wal"];

const resetRuns = async () => {
  await rm(RUNS_DIR, { recursive: true, force: true });
  await mkdir(RUNS_DIR, { recursive: true });

  await Promise.all(
    DB_FILES.map(async (name) => {
      await rm(join(STORAGE_DIR, name), { force: true });
    }),
  );
};

const main = async () => {
  await resetRuns();
  console.log("[reset-runs] cleared storage/runs and api sqlite files");
};

main().catch((error) => {
  console.error("[reset-runs] failed:", error);
  process.exit(1);
});
