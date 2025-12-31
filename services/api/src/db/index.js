import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(MODULE_DIR, "..", "..", "..", "..");
const STORAGE_DIR = join(REPO_ROOT, "storage");
const DEFAULT_DB_PATH = join(STORAGE_DIR, "api.sqlite");
const SCHEMA_PATH = join(REPO_ROOT, "services", "api", "src", "db", "schema.sql");
const DEFAULT_RISK_PROFILE = {
  id: "default",
  name: "default guardrails",
  maxDailyLossPct: 0.03,
  maxPositionPct: 0.2,
  perOrderCapPct: 0.1,
  globalDDKillPct: 0.05,
  cooldownMinutes: 15,
};
export class ApiDatabase {
  constructor(db) {
    this.db = db;
  }
  async insertRun(args) {
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
  async updateRunStatus(runId, status, errorMessage) {
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
  async toggleRunFavorite(runId) {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }
    const newFavorite = run.favorite === 1 ? 0 : 1;
    await this.db.run(
      `update runs
          set favorite = :favorite
        where run_id = :runId`,
      {
        ":runId": runId,
        ":favorite": newFavorite,
      },
    );
    return newFavorite === 1;
  }
  async saveRunResult(result) {
    await this.db.exec("savepoint save_run_result");
    try {
      await this.db.run(
        `update runs
            set status = :status,
                summary_json = :summaryJson,
                execution_time_ms = :executionTimeMs
          where run_id = :runId`,
        {
          ":runId": result.runId,
          ":status": "completed",
          ":summaryJson": JSON.stringify(result.summary ?? {}),
          ":executionTimeMs": result.executionTimeMs ?? null,
        },
      );
      await this.db.run(`delete from artifacts where run_id = :runId`, {
        ":runId": result.runId,
      });
      const artifacts = [
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
  async listRuns() {
    const rows = await this.db.all(`select run_id as runId,
              name,
              created_at as createdAt,
              status,
              summary_json as summaryJson,
              error_message as errorMessage,
              request_json as requestJson,
              favorite
         from runs
     order by created_at desc`);
    return rows;
  }
  /**
   * Get the oldest queued job for processing (FIFO order).
   */
  async getOldestQueuedRun() {
    return this.db.get(`select run_id as runId,
              name,
              created_at as createdAt,
              status,
              summary_json as summaryJson,
              error_message as errorMessage
         from runs
        where status = 'queued'
     order by created_at asc
        limit 1`);
  }
  async getRun(runId) {
    return this.db.get(
      `select run_id as runId,
              name,
              created_at as createdAt,
              status,
              request_json as requestJson,
              summary_json as summaryJson,
              error_message as errorMessage,
              favorite
         from runs
        where run_id = :runId`,
      { ":runId": runId },
    );
  }
  async getArtifacts(runId) {
    return this.db.all(
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
  async listDatasets() {
    return this.db.all(`select id,
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
     order by created_at desc`);
  }
  async findDataset(args) {
    const row = await this.db.get(
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
  async upsertDataset(args) {
    const existing = await this.db.get(
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
  async deleteDatasetRecord(args) {
    await this.db.run(`delete from datasets where symbol = :symbol and timeframe = :timeframe`, {
      ":symbol": args.symbol,
      ":timeframe": args.timeframe,
    });
  }
  async listRiskProfiles() {
    const rows = await this.db.all(`select id, name, json
         from risk_profiles
     order by name asc`);
    return rows.map((row) => parseRiskProfile(row.json)).filter((profile) => profile !== null);
  }
  async getRiskProfileById(profileId) {
    const row = await this.db.get(
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
  async upsertRiskProfile(profile) {
    const existing = await this.db.get(
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
  async ensureRiskProfile(profile) {
    const existing = await this.getRiskProfileById(profile.id);
    if (!existing) {
      await this.upsertRiskProfile(profile);
    }
  }
  async insertStatTest(args) {
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
    return result.lastID;
  }
  async listStatTests(runId) {
    return this.db.all(
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
  async getStatTest(id) {
    return this.db.get(
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
  async insertOptimization(args) {
    await this.db.run(
      `insert into optimizations (
        opt_id, name, strategy_name, param_grid_json, objective,
        constraints_json, walk_forward_config_json, bootstrap_iterations,
        permutation_iterations, seed, total_combinations, base_request_json,
        created_at, status
      ) values (
        :optId, :name, :strategyName, :paramGridJson, :objective,
        :constraintsJson, :walkForwardConfigJson, :bootstrapIterations,
        :permutationIterations, :seed, :totalCombinations, :baseRequestJson,
        :createdAt, 'queued'
      )`,
      {
        ":optId": args.optId,
        ":name": args.name,
        ":strategyName": args.strategyName,
        ":paramGridJson": args.paramGridJson,
        ":objective": args.objective,
        ":constraintsJson": args.constraintsJson,
        ":walkForwardConfigJson": args.walkForwardConfigJson,
        ":bootstrapIterations": args.bootstrapIterations,
        ":permutationIterations": args.permutationIterations,
        ":seed": args.seed,
        ":totalCombinations": args.totalCombinations,
        ":baseRequestJson": args.baseRequestJson,
        ":createdAt": args.createdAt ?? new Date().toISOString(),
      },
    );
  }
  async getOptimization(optId) {
    return this.db.get(
      `select opt_id as optId,
              name,
              strategy_name as strategyName,
              param_grid_json as paramGridJson,
              objective,
              constraints_json as constraintsJson,
              walk_forward_config_json as walkForwardConfigJson,
              bootstrap_iterations as bootstrapIterations,
              permutation_iterations as permutationIterations,
              seed,
              status,
              best_params_json as bestParamsJson,
              best_score as bestScore,
              best_robustness_score as bestRobustnessScore,
              results_json as resultsJson,
              walk_forward_results_json as walkForwardResultsJson,
              total_combinations as totalCombinations,
              completed_combinations as completedCombinations,
              estimated_time_remaining_ms as estimatedTimeRemainingMs,
              base_request_json as baseRequestJson,
              created_at as createdAt,
              completed_at as completedAt,
              error_message as errorMessage
         from optimizations
        where opt_id = :optId`,
      { ":optId": optId },
    );
  }
  async listOptimizations() {
    return this.db.all(`select opt_id as optId,
              name,
              strategy_name as strategyName,
              objective,
              status,
              best_score as bestScore,
              total_combinations as totalCombinations,
              created_at as createdAt,
              completed_at as completedAt
         from optimizations
     order by created_at desc`);
  }
  async updateOptimization(optId, updates) {
    const setClauses = [];
    const params = { ":optId": optId };
    if (updates.status !== undefined) {
      setClauses.push("status = :status");
      params[":status"] = updates.status;
    }
    if (updates.bestParamsJson !== undefined) {
      setClauses.push("best_params_json = :bestParamsJson");
      params[":bestParamsJson"] = updates.bestParamsJson;
    }
    if (updates.bestScore !== undefined) {
      setClauses.push("best_score = :bestScore");
      params[":bestScore"] = updates.bestScore;
    }
    if (updates.bestRobustnessScore !== undefined) {
      setClauses.push("best_robustness_score = :bestRobustnessScore");
      params[":bestRobustnessScore"] = updates.bestRobustnessScore;
    }
    if (updates.resultsJson !== undefined) {
      setClauses.push("results_json = :resultsJson");
      params[":resultsJson"] = updates.resultsJson;
    }
    if (updates.walkForwardResultsJson !== undefined) {
      setClauses.push("walk_forward_results_json = :walkForwardResultsJson");
      params[":walkForwardResultsJson"] = updates.walkForwardResultsJson;
    }
    if (updates.completedAt !== undefined) {
      setClauses.push("completed_at = :completedAt");
      params[":completedAt"] = updates.completedAt;
    }
    if (updates.errorMessage !== undefined) {
      setClauses.push("error_message = :errorMessage");
      params[":errorMessage"] = updates.errorMessage;
    }
    if (updates.completedCombinations !== undefined) {
      setClauses.push("completed_combinations = :completedCombinations");
      params[":completedCombinations"] = updates.completedCombinations;
    }
    if (updates.estimatedTimeRemainingMs !== undefined) {
      setClauses.push("estimated_time_remaining_ms = :estimatedTimeRemainingMs");
      params[":estimatedTimeRemainingMs"] = updates.estimatedTimeRemainingMs;
    }
    if (setClauses.length === 0) {
      return;
    }
    await this.db.run(
      `update optimizations set ${setClauses.join(", ")} where opt_id = :optId`,
      params,
    );
  }
  async getOldestQueuedOptimization() {
    return this.db.get(`select opt_id as optId,
              name,
              strategy_name as strategyName,
              param_grid_json as paramGridJson,
              objective,
              constraints_json as constraintsJson,
              walk_forward_config_json as walkForwardConfigJson,
              bootstrap_iterations as bootstrapIterations,
              permutation_iterations as permutationIterations,
              seed,
              base_request_json as baseRequestJson
         from optimizations
        where status = 'queued'
     order by created_at asc
        limit 1`);
  }
  async reset() {
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
  async close() {
    await this.db.close();
  }
}
export const createApiDatabase = async (options = {}) => {
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
  // Migration: Add favorite column if it doesn't exist
  try {
    const tableInfo = await db.all("pragma table_info(runs)");
    const hasFavoriteColumn = tableInfo.some((col) => col.name === "favorite");
    if (!hasFavoriteColumn) {
      await db.exec("alter table runs add column favorite integer not null default 0");
    }
  } catch (error) {
    // Table might not exist yet, which is fine (schema will create it)
  }
  const database = new ApiDatabase(db);
  await database.ensureRiskProfile(DEFAULT_RISK_PROFILE);
  return database;
};
const parseRiskProfile = (payload) => {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
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
//# sourceMappingURL=index.js.map
