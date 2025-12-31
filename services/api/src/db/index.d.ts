import sqlite3 from "sqlite3";
import { type Database as SQLiteDatabase } from "sqlite";
import type { BacktestResult, RiskProfile } from "@crucible-trader/sdk";
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
  readonly favorite: number;
  readonly executionTimeMs: number | null;
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
  readonly requestJson: string;
  readonly favorite: number;
  readonly executionTimeMs: number | null;
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
export declare class ApiDatabase {
  private readonly db;
  constructor(db: SqliteInstance);
  insertRun(args: {
    runId: string;
    name: string | null;
    createdAt: string;
    status: string;
    requestJson: string;
  }): Promise<void>;
  updateRunStatus(runId: string, status: string, errorMessage?: string): Promise<void>;
  toggleRunFavorite(runId: string): Promise<boolean>;
  saveRunResult(result: BacktestResult): Promise<void>;
  listRuns(): Promise<RunSummaryRow[]>;
  /**
   * Get the oldest queued job for processing (FIFO order).
   */
  getOldestQueuedRun(): Promise<RunSummaryRow | undefined>;
  getRun(runId: string): Promise<RunRecord | undefined>;
  getArtifacts(runId: string): Promise<ArtifactRecord[]>;
  listDatasets(): Promise<DatasetRecord[]>;
  findDataset(args: { symbol: string; timeframe: string }): Promise<
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
  >;
  upsertDataset(args: {
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
  }): Promise<void>;
  deleteDatasetRecord(args: { symbol: string; timeframe: string }): Promise<void>;
  listRiskProfiles(): Promise<RiskProfile[]>;
  getRiskProfileById(profileId: string): Promise<RiskProfile | undefined>;
  upsertRiskProfile(profile: RiskProfile): Promise<void>;
  ensureRiskProfile(profile: RiskProfile): Promise<void>;
  insertStatTest(args: {
    runId: string;
    testType: string;
    pValue?: number | null;
    confidenceLevel?: number | null;
    inSampleMetric?: number | null;
    outSampleMetric?: number | null;
    metadataJson?: string | null;
    createdAt: string;
  }): Promise<number>;
  listStatTests(runId: string): Promise<StatTestRecord[]>;
  getStatTest(id: number): Promise<StatTestRecord | undefined>;
  insertOptimization(args: {
    optId: string;
    name: string;
    strategyName: string;
    paramGridJson: string;
    objective: string;
    constraintsJson: string | null;
    walkForwardConfigJson: string | null;
    bootstrapIterations: number | null;
    permutationIterations: number | null;
    seed: number | null;
    totalCombinations: number;
    baseRequestJson: string;
    createdAt?: string;
  }): Promise<void>;
  getOptimization(optId: string): Promise<
    | {
        optId: string;
        name: string;
        strategyName: string;
        paramGridJson: string;
        objective: string;
        constraintsJson: string | null;
        walkForwardConfigJson: string | null;
        bootstrapIterations: number | null;
        permutationIterations: number | null;
        seed: number | null;
        status: string;
        bestParamsJson: string | null;
        bestScore: number | null;
        bestRobustnessScore: number | null;
        resultsJson: string | null;
        walkForwardResultsJson: string | null;
        totalCombinations: number;
        completedCombinations: number | null;
        estimatedTimeRemainingMs: number | null;
        baseRequestJson: string;
        createdAt: string;
        completedAt: string | null;
        errorMessage: string | null;
      }
    | undefined
  >;
  listOptimizations(): Promise<
    Array<{
      optId: string;
      name: string;
      strategyName: string;
      objective: string;
      status: string;
      bestScore: number | null;
      totalCombinations: number;
      createdAt: string;
      completedAt: string | null;
    }>
  >;
  updateOptimization(
    optId: string,
    updates: {
      status?: string;
      bestParamsJson?: string;
      bestScore?: number;
      bestRobustnessScore?: number;
      resultsJson?: string;
      walkForwardResultsJson?: string;
      completedAt?: string;
      errorMessage?: string;
      completedCombinations?: number;
      estimatedTimeRemainingMs?: number;
    },
  ): Promise<void>;
  getOldestQueuedOptimization(): Promise<
    | {
        optId: string;
        name: string;
        strategyName: string;
        paramGridJson: string;
        objective: string;
        constraintsJson: string | null;
        walkForwardConfigJson: string | null;
        bootstrapIterations: number | null;
        permutationIterations: number | null;
        seed: number | null;
        baseRequestJson: string;
      }
    | undefined
  >;
  reset(): Promise<void>;
  close(): Promise<void>;
}
export declare const createApiDatabase: (options?: ApiDatabaseOptions) => Promise<ApiDatabase>;
export {};
