import sqlite3 from "sqlite3";
import { open, type Database as SQLiteDatabase } from "sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import type { BacktestResult } from "@crucible-trader/sdk";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(MODULE_DIR, "..", "..", "..", "..");
const STORAGE_DIR = join(REPO_ROOT, "storage");
const DEFAULT_DB_PATH = join(STORAGE_DIR, "api.sqlite");
const SCHEMA_PATH = join(REPO_ROOT, "services", "api", "src", "db", "schema.sql");

type SqliteInstance = SQLiteDatabase<sqlite3.Database, sqlite3.Statement>;

export interface ApiDatabaseOptions {
  readonly filename?: string;
}

export interface RunRecord {
  readonly runId: string;
  readonly name: string | null;
  readonly createdAt: string;
  readonly status: string;
  readonly requestJson: string;
  readonly summaryJson: string | null;
}

export interface ArtifactRecord {
  readonly id: number;
  readonly runId: string;
  readonly kind: string;
  readonly path: string;
  readonly checksum: string | null;
}

export interface RunSummaryRow {
  readonly runId: string;
  readonly name: string | null;
  readonly createdAt: string;
  readonly status: string;
}

export class ApiDatabase {
  public constructor(private readonly db: SqliteInstance) {}

  public async insertRun(args: {
    runId: string;
    name: string | null;
    createdAt: string;
    status: string;
    requestJson: string;
  }): Promise<void> {
    await this.db.run(
      `insert into runs (run_id, name, created_at, status, request_json)
       values (:runId, :name, :createdAt, :status, :requestJson)`,
      {
        ":runId": args.runId,
        ":name": args.name,
        ":createdAt": args.createdAt,
        ":status": args.status,
        ":requestJson": args.requestJson,
      },
    );
  }

  public async updateRunStatus(runId: string, status: string): Promise<void> {
    await this.db.run(
      `update runs
          set status = :status
        where run_id = :runId`,
      {
        ":runId": runId,
        ":status": status,
      },
    );
  }

  public async saveRunResult(result: BacktestResult): Promise<void> {
    await this.db.exec("begin immediate transaction");
    try {
      await this.db.run(
        `update runs
            set status = :status,
                summary_json = :summaryJson
          where run_id = :runId`,
        {
          ":runId": result.runId,
          ":status": "completed",
          ":summaryJson": JSON.stringify(result.summary ?? {}),
        },
      );

      await this.db.run(`delete from artifacts where run_id = :runId`, {
        ":runId": result.runId,
      });

      const artifacts: Array<{ kind: string; path: string }> = [
        { kind: "equity", path: result.artifacts.equityParquet },
        { kind: "trades", path: result.artifacts.tradesParquet },
        { kind: "bars", path: result.artifacts.barsParquet },
      ];

      if (result.artifacts.reportMd) {
        artifacts.push({ kind: "report", path: result.artifacts.reportMd });
      }

      for (const artifact of artifacts) {
        await this.db.run(
          `insert into artifacts (run_id, kind, path, checksum)
           values (:runId, :kind, :path, :checksum)`,
          {
            ":runId": result.runId,
            ":kind": artifact.kind,
            ":path": normalize(artifact.path),
            ":checksum": null,
          },
        );
      }

      await this.db.exec("commit");
    } catch (error) {
      await this.db.exec("rollback");
      throw error;
    }
  }

  public async listRuns(): Promise<RunSummaryRow[]> {
    const rows = await this.db.all<RunSummaryRow[]>(
      `select run_id as runId,
              name,
              created_at as createdAt,
              status
         from runs
     order by created_at desc`,
    );
    return rows;
  }

  public async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.db.get<RunRecord>(
      `select run_id as runId,
              name,
              created_at as createdAt,
              status,
              request_json as requestJson,
              summary_json as summaryJson
         from runs
        where run_id = :runId`,
      { ":runId": runId },
    );
  }

  public async getArtifacts(runId: string): Promise<ArtifactRecord[]> {
    return this.db.all<ArtifactRecord[]>(
      `select id,
              run_id as runId,
              kind,
              path,
              checksum
         from artifacts
        where run_id = :runId
     order by id asc`,
      { ":runId": runId },
    );
  }

  public async reset(): Promise<void> {
    await this.db.exec("begin immediate transaction");
    try {
      await this.db.exec("delete from artifacts;");
      await this.db.exec("delete from runs;");
      await this.db.exec("commit");
    } catch (error) {
      await this.db.exec("rollback");
      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.db.close();
  }
}

export const createApiDatabase = async (options: ApiDatabaseOptions = {}): Promise<ApiDatabase> => {
  const filename = normalize(options.filename ?? DEFAULT_DB_PATH);
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const db = await open({
    filename,
    driver: sqlite3.Database,
  });

  await db.exec("pragma journal_mode = WAL;");
  await db.exec("pragma foreign_keys = ON;");

  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  await db.exec(schema);

  return new ApiDatabase(db);
};
