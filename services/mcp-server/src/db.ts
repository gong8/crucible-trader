/**
 * Database utilities for MCP server.
 * Re-exports ApiDatabase from the API service for use in MCP tools.
 */

import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open, type Database as SQLiteDatabase } from "sqlite";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createMcpLogger } from "./logger.js";

const logger = createMcpLogger("@crucible-trader/mcp-server/db");

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = normalize(join(MODULE_DIR, "..", "..", ".."));
const STORAGE_DIR = join(REPO_ROOT, "storage");
const DB_PATH = join(STORAGE_DIR, "db", "api.sqlite");
const SCHEMA_PATH = join(REPO_ROOT, "services", "api", "src", "db", "schema.sql");

export type RunRecord = {
  readonly runId: string;
  readonly name: string | null;
  readonly createdAt: string;
  readonly status: string;
  readonly requestJson: string;
  readonly summaryJson: string | null;
  readonly errorMessage: string | null;
  readonly favorite: number;
  readonly executionTimeMs: number | null;
};

export type DatasetRecord = {
  readonly id: number;
  readonly source: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly start: string | null;
  readonly end: string | null;
  readonly adjusted: number | null;
  readonly path: string;
  readonly checksum: string | null;
  readonly rows: number | null;
  readonly createdAt: string;
};

export type RunSummaryRow = {
  readonly runId: string;
  readonly name: string | null;
  readonly createdAt: string;
  readonly status: string;
  readonly summaryJson: string | null;
  readonly errorMessage: string | null;
  readonly requestJson: string;
  readonly favorite: number;
  readonly executionTimeMs: number | null;
};

export type SqliteInstance = SQLiteDatabase<sqlite3.Database, sqlite3.Statement>;

/**
 * Opens and initializes the API database.
 */
export async function openDatabase(): Promise<SqliteInstance> {
  // Ensure storage directory exists
  const dbDir = join(STORAGE_DIR, "db");
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info(`Created database directory: ${dbDir}`);
  }

  // Open database
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  logger.info(`Opened database: ${DB_PATH}`);

  // Initialize schema if needed
  if (existsSync(SCHEMA_PATH)) {
    const schema = readFileSync(SCHEMA_PATH, "utf-8");
    await db.exec(schema);
    logger.info("Database schema initialized");
  } else {
    logger.warn(`Schema file not found: ${SCHEMA_PATH}`);
  }

  return db;
}

/**
 * Get the repository root directory.
 */
export function getRepoRoot(): string {
  return REPO_ROOT;
}

/**
 * Get the storage directory path.
 */
export function getStorageDir(): string {
  return STORAGE_DIR;
}
