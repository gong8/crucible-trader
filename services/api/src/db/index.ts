import sqlite3 from "sqlite3";
import { open, type Database as SQLiteDatabase } from "sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import type { BacktestResult, RiskProfile } from "@crucible-trader/sdk";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(MODULE_DIR, "..", "..", "..", "..");
const STORAGE_DIR = join(REPO_ROOT, "storage");
const DEFAULT_DB_PATH = join(STORAGE_DIR, "api.sqlite");
const SCHEMA_PATH = join(REPO_ROOT, "services", "api", "src", "db", "schema.sql");
const DEFAULT_RISK_PROFILE: RiskProfile = {
  id: "default",
  name: "default guardrails",
  maxDailyLossPct: 0.03,
  maxPositionPct: 0.2,
  perOrderCapPct: 0.1,
  globalDDKillPct: 0.05,
  cooldownMinutes: 15,
};

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
  readonly errorMessage: string | null;
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
  readonly summaryJson: string | null;
  readonly errorMessage: string | null;
}

export interface DatasetRecord {
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
}

export interface RiskProfileRow {
  readonly id: number;
  readonly name: string;
  readonly json: string;
}

export interface StatTestRecord {
  readonly id: number;
  readonly runId: string;
  readonly testType: string;
  readonly pValue: number | null;
  readonly confidenceLevel: number | null;
  readonly inSampleMetric: number | null;
  readonly outSampleMetric: number | null;
  readonly metadataJson: string | null;
  readonly createdAt: string;
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

  public async updateRunStatus(
    runId: string,
    status: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.db.run(
      `update runs
          set status = :status,
              error_message = :errorMessage
        where run_id = :runId`,
      {
        ":runId": runId,
        ":status": status,
        ":errorMessage": errorMessage ?? null,
      },
    );
  }

  public async saveRunResult(result: BacktestResult): Promise<void> {
    await this.db.exec("savepoint save_run_result");
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

      await this.db.exec("release save_run_result");
    } catch (error) {
      await this.db.exec("rollback to save_run_result");
      await this.db.exec("release save_run_result");
      throw error;
    }
  }

  public async listRuns(): Promise<RunSummaryRow[]> {
    const rows = await this.db.all<RunSummaryRow[]>(
      `select run_id as runId,
              name,
              created_at as createdAt,
              status,
              summary_json as summaryJson,
              error_message as errorMessage
         from runs
     order by created_at desc`,
    );
    return rows;
  }

  /**
   * Get the oldest queued job for processing (FIFO order).
   */
  public async getOldestQueuedRun(): Promise<RunSummaryRow | undefined> {
    return this.db.get<RunSummaryRow>(
      `select run_id as runId,
              name,
              created_at as createdAt,
              status,
              summary_json as summaryJson,
              error_message as errorMessage
         from runs
        where status = 'queued'
     order by created_at asc
        limit 1`,
    );
  }

  public async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.db.get<RunRecord>(
      `select run_id as runId,
              name,
              created_at as createdAt,
              status,
              request_json as requestJson,
              summary_json as summaryJson,
              error_message as errorMessage
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

  public async listDatasets(): Promise<DatasetRecord[]> {
    return this.db.all<DatasetRecord[]>(
      `select id,
              source,
              symbol,
              timeframe,
              start,
              end,
              adjusted,
              path,
              checksum,
              rows,
              created_at as createdAt
         from datasets
     order by created_at desc`,
    );
  }

  public async findDataset(args: { symbol: string; timeframe: string }): Promise<
    | {
        source: string;
        symbol: string;
        timeframe: string;
        start?: string | null;
        end?: string | null;
        adjusted?: boolean;
        path: string;
        checksum?: string | null;
        rows: number;
        createdAt: string;
      }
    | undefined
  > {
    const row = await this.db.get<DatasetRecord>(
      `select id,
              source,
              symbol,
              timeframe,
              start,
              end,
              adjusted,
              path,
              checksum,
              rows,
              created_at as createdAt
         from datasets
        where symbol = :symbol
          and timeframe = :timeframe
     limit 1`,
      {
        ":symbol": args.symbol,
        ":timeframe": args.timeframe,
      },
    );

    if (!row) {
      return undefined;
    }

    return {
      source: row.source,
      symbol: row.symbol,
      timeframe: row.timeframe,
      start: row.start,
      end: row.end,
      adjusted: row.adjusted === null ? undefined : row.adjusted === 1,
      path: row.path,
      checksum: row.checksum ?? undefined,
      rows: row.rows ?? 0,
      createdAt: row.createdAt,
    };
  }

  public async upsertDataset(args: {
    source: string;
    symbol: string;
    timeframe: string;
    start?: string | null;
    end?: string | null;
    adjusted?: boolean;
    path: string;
    checksum?: string | null;
    rows: number;
    createdAt: string;
  }): Promise<void> {
    const existing = await this.db.get<{ id: number }>(
      `select id
         from datasets
        where symbol = :symbol
          and timeframe = :timeframe
     limit 1`,
      {
        ":symbol": args.symbol,
        ":timeframe": args.timeframe,
      },
    );

    const payload = {
      ":source": args.source,
      ":symbol": args.symbol,
      ":timeframe": args.timeframe,
      ":start": args.start ?? null,
      ":end": args.end ?? null,
      ":adjusted": args.adjusted ? 1 : 0,
      ":path": normalize(args.path),
      ":checksum": args.checksum ?? null,
      ":rows": args.rows,
      ":createdAt": args.createdAt,
    };

    if (existing?.id) {
      await this.db.run(
        `update datasets
            set source = :source,
                start = :start,
                end = :end,
                adjusted = :adjusted,
                path = :path,
                checksum = :checksum,
                rows = :rows,
                created_at = :createdAt
          where id = :id`,
        {
          ":id": existing.id,
          ":source": payload[":source"],
          ":start": payload[":start"],
          ":end": payload[":end"],
          ":adjusted": payload[":adjusted"],
          ":path": payload[":path"],
          ":checksum": payload[":checksum"],
          ":rows": payload[":rows"],
          ":createdAt": payload[":createdAt"],
        },
      );
      return;
    }

    await this.db.run(
      `insert into datasets (source, symbol, timeframe, start, end, adjusted, path, checksum, rows, created_at)
       values (:source, :symbol, :timeframe, :start, :end, :adjusted, :path, :checksum, :rows, :createdAt)`,
      payload,
    );
  }

  public async deleteDatasetRecord(args: { symbol: string; timeframe: string }): Promise<void> {
    await this.db.run(`delete from datasets where symbol = :symbol and timeframe = :timeframe`, {
      ":symbol": args.symbol,
      ":timeframe": args.timeframe,
    });
  }

  public async listRiskProfiles(): Promise<RiskProfile[]> {
    const rows = await this.db.all<RiskProfileRow[]>(
      `select id, name, json
         from risk_profiles
     order by name asc`,
    );
    return rows
      .map((row) => parseRiskProfile(row.json))
      .filter((profile): profile is RiskProfile => profile !== null);
  }

  public async getRiskProfileById(profileId: string): Promise<RiskProfile | undefined> {
    const row = await this.db.get<{ json: string }>(
      `select json
         from risk_profiles
        where json_extract(json, '$.id') = :profileId
     limit 1`,
      { ":profileId": profileId },
    );
    if (!row?.json) {
      return undefined;
    }
    const parsed = parseRiskProfile(row.json);
    return parsed ?? undefined;
  }

  public async upsertRiskProfile(profile: RiskProfile): Promise<void> {
    const existing = await this.db.get<{ id: number }>(
      `select id
         from risk_profiles
        where json_extract(json, '$.id') = :profileId
     limit 1`,
      { ":profileId": profile.id },
    );
    const payload = {
      ":name": profile.name,
      ":json": JSON.stringify(profile),
    };
    if (existing?.id) {
      await this.db.run(
        `update risk_profiles
            set name = :name,
                json = :json
          where id = :id`,
        { ...payload, ":id": existing.id },
      );
      return;
    }
    await this.db.run(
      `insert into risk_profiles (name, json)
       values (:name, :json)`,
      payload,
    );
  }

  public async ensureRiskProfile(profile: RiskProfile): Promise<void> {
    const existing = await this.getRiskProfileById(profile.id);
    if (!existing) {
      await this.upsertRiskProfile(profile);
    }
  }

  public async insertStatTest(args: {
    runId: string;
    testType: string;
    pValue?: number | null;
    confidenceLevel?: number | null;
    inSampleMetric?: number | null;
    outSampleMetric?: number | null;
    metadataJson?: string | null;
    createdAt: string;
  }): Promise<number> {
    const result = await this.db.run(
      `insert into stat_tests (run_id, test_type, p_value, confidence_level, in_sample_metric, out_sample_metric, metadata_json, created_at)
       values (:runId, :testType, :pValue, :confidenceLevel, :inSampleMetric, :outSampleMetric, :metadataJson, :createdAt)`,
      {
        ":runId": args.runId,
        ":testType": args.testType,
        ":pValue": args.pValue ?? null,
        ":confidenceLevel": args.confidenceLevel ?? null,
        ":inSampleMetric": args.inSampleMetric ?? null,
        ":outSampleMetric": args.outSampleMetric ?? null,
        ":metadataJson": args.metadataJson ?? null,
        ":createdAt": args.createdAt,
      },
    );
    return result.lastID!;
  }

  public async listStatTests(runId: string): Promise<StatTestRecord[]> {
    return this.db.all<StatTestRecord[]>(
      `select id,
              run_id as runId,
              test_type as testType,
              p_value as pValue,
              confidence_level as confidenceLevel,
              in_sample_metric as inSampleMetric,
              out_sample_metric as outSampleMetric,
              metadata_json as metadataJson,
              created_at as createdAt
         from stat_tests
        where run_id = :runId
     order by created_at desc`,
      { ":runId": runId },
    );
  }

  public async getStatTest(id: number): Promise<StatTestRecord | undefined> {
    return this.db.get<StatTestRecord>(
      `select id,
              run_id as runId,
              test_type as testType,
              p_value as pValue,
              confidence_level as confidenceLevel,
              in_sample_metric as inSampleMetric,
              out_sample_metric as outSampleMetric,
              metadata_json as metadataJson,
              created_at as createdAt
         from stat_tests
        where id = :id`,
      { ":id": id },
    );
  }

  public async reset(): Promise<void> {
    await this.db.exec("begin immediate transaction");
    try {
      // Delete in correct order to respect foreign key constraints
      await this.db.exec("delete from stat_tests;");
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

  const database = new ApiDatabase(db);
  await database.ensureRiskProfile(DEFAULT_RISK_PROFILE);
  return database;
};

const parseRiskProfile = (payload: unknown): RiskProfile | null => {
  try {
    const parsed =
      typeof payload === "string" ? (JSON.parse(payload) as RiskProfile) : (payload as RiskProfile);
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.name === "string" &&
      typeof parsed.maxDailyLossPct === "number" &&
      typeof parsed.maxPositionPct === "number" &&
      typeof parsed.perOrderCapPct === "number" &&
      typeof parsed.globalDDKillPct === "number" &&
      typeof parsed.cooldownMinutes === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};
