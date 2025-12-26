import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { runPermutationTest, runBootstrap } from "@crucible-trader/stats";
import type {
  PermutationTestConfig,
  PermutationTestResult,
  BootstrapConfig,
  BootstrapResult,
  EquityPoint,
  Trade,
} from "@crucible-trader/stats";
import { createLogger } from "@crucible-trader/logger";
import { createRequire } from "node:module";
import type { StatTestRecord } from "../db/index.js";

const require = createRequire(import.meta.url);
const { ParquetReader } = require("parquetjs/parquet.js");

const ROUTES_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(ROUTES_DIR, "..", "..", "..", "..");
const RUNS_ROOT = join(REPO_ROOT, "storage", "runs");

const logger = createLogger("services/api/stats");

export interface StatsRouteDeps {
  readonly insertStatTest: (args: {
    runId: string;
    testType: string;
    pValue?: number | null;
    confidenceLevel?: number | null;
    inSampleMetric?: number | null;
    outSampleMetric?: number | null;
    metadataJson?: string | null;
    createdAt: string;
  }) => Promise<number>;
  readonly listStatTests: (runId: string) => Promise<StatTestRecord[]>;
  readonly getStatTest: (id: number) => Promise<StatTestRecord | undefined>;
}

interface PermutationTestRequest {
  readonly runId: string;
  readonly iterations?: number;
  readonly metric?: string;
  readonly seed?: number;
  readonly alpha?: number;
}

interface BootstrapRequest {
  readonly runId: string;
  readonly iterations?: number;
  readonly metric?: string;
  readonly seed?: number;
  readonly confidenceLevel?: number;
}

interface RunIdParams {
  readonly runId: string;
}

interface StatTestIdParams {
  readonly id: string;
}

export const registerStatsRoutes = (app: FastifyInstance, deps: StatsRouteDeps): void => {
  /**
   * POST /api/stats/permutation
   * Run permutation test on a completed backtest
   */
  app.post(
    "/api/stats/permutation",
    async (
      request: FastifyRequest<{ Body: PermutationTestRequest }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const { runId, iterations = 1000, metric = "sharpe", seed = 42, alpha = 0.05 } = request.body;

      if (!runId) {
        return reply.code(400).send({ message: "runId is required" });
      }

      try {
        // Load equity and trades from parquet files
        const equityPath = normalize(join(RUNS_ROOT, runId, "equity.parquet"));
        const tradesPath = normalize(join(RUNS_ROOT, runId, "trades.parquet"));

        const [equityRows, tradeRows] = await Promise.all([
          readParquetRows(equityPath, ["time", "equity"]),
          readParquetRows(tradesPath, ["time", "side", "price", "qty", "pnl"]),
        ]);

        const equity: EquityPoint[] = equityRows.map((row) => ({
          time: String(row.time ?? ""),
          equity: Number(row.equity ?? 0),
        }));

        const trades: Trade[] = tradeRows.map((row) => ({
          time: String(row.time ?? ""),
          side: String(row.side ?? "buy") as "buy" | "sell",
          price: Number(row.price ?? 0),
          qty: Number(row.qty ?? 0),
          pnl: Number(row.pnl ?? 0),
        }));

        if (equity.length === 0) {
          return reply.code(400).send({ message: "No equity data found for run" });
        }

        const initialCash = equity[0]?.equity ?? 100000;

        const config: PermutationTestConfig = {
          iterations,
          metric,
          seed,
          alpha,
        };

        const result: PermutationTestResult = runPermutationTest(
          equity,
          trades,
          initialCash,
          config,
        );

        // Save to database
        const dbTestId = await deps.insertStatTest({
          runId,
          testType: "permutation",
          pValue: result.pValue,
          confidenceLevel: null,
          inSampleMetric: result.originalMetric,
          outSampleMetric: null,
          metadataJson: JSON.stringify({
            iterations,
            metric,
            seed,
            alpha,
            zScore: result.zScore,
            isSignificant: result.isSignificant,
          }),
          createdAt: new Date().toISOString(),
        });

        return reply.code(201).send({
          dbTestId,
          ...result,
        });
      } catch (error) {
        logger.error("Permutation test failed", {
          runId,
          error: error instanceof Error ? error.message : String(error),
        });
        return reply.code(500).send({
          message: error instanceof Error ? error.message : "Permutation test failed",
        });
      }
    },
  );

  /**
   * POST /api/stats/bootstrap
   * Run bootstrap analysis on a completed backtest
   */
  app.post(
    "/api/stats/bootstrap",
    async (
      request: FastifyRequest<{ Body: BootstrapRequest }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const {
        runId,
        iterations = 1000,
        metric = "sharpe",
        seed = 42,
        confidenceLevel = 0.95,
      } = request.body;

      if (!runId) {
        return reply.code(400).send({ message: "runId is required" });
      }

      try {
        // Load equity from parquet files
        const equityPath = normalize(join(RUNS_ROOT, runId, "equity.parquet"));
        const equityRows = await readParquetRows(equityPath, ["time", "equity"]);

        const equity: EquityPoint[] = equityRows.map((row) => ({
          time: String(row.time ?? ""),
          equity: Number(row.equity ?? 0),
        }));

        if (equity.length === 0) {
          return reply.code(400).send({ message: "No equity data found for run" });
        }

        const config: BootstrapConfig = {
          iterations,
          metric,
          seed,
          confidenceLevel,
        };

        const result: BootstrapResult = runBootstrap(equity, config);

        // Save to database
        const dbTestId = await deps.insertStatTest({
          runId,
          testType: "bootstrap",
          pValue: null,
          confidenceLevel: result.confidenceLevel,
          inSampleMetric: result.pointEstimate,
          outSampleMetric: null,
          metadataJson: JSON.stringify({
            iterations,
            metric,
            seed,
            confidenceLevel,
            ciLower: result.ciLower,
            ciUpper: result.ciUpper,
            standardError: result.standardError,
          }),
          createdAt: new Date().toISOString(),
        });

        return reply.code(201).send({
          dbTestId,
          ...result,
        });
      } catch (error) {
        logger.error("Bootstrap analysis failed", {
          runId,
          error: error instanceof Error ? error.message : String(error),
        });
        return reply.code(500).send({
          message: error instanceof Error ? error.message : "Bootstrap analysis failed",
        });
      }
    },
  );

  /**
   * GET /api/stats/:runId
   * Get all statistical tests for a run
   */
  app.get(
    "/api/stats/:runId",
    async (
      request: FastifyRequest<{ Params: RunIdParams }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const { runId } = request.params;

      try {
        const tests = await deps.listStatTests(runId);

        // Parse metadata JSON for each test
        const enrichedTests = tests.map((test) => {
          let metadata: Record<string, unknown> = {};
          if (test.metadataJson) {
            try {
              metadata = JSON.parse(test.metadataJson) as Record<string, unknown>;
            } catch {
              metadata = {};
            }
          }

          return {
            id: test.id,
            runId: test.runId,
            testType: test.testType,
            pValue: test.pValue,
            confidenceLevel: test.confidenceLevel,
            inSampleMetric: test.inSampleMetric,
            outSampleMetric: test.outSampleMetric,
            createdAt: test.createdAt,
            metadata,
          };
        });

        return reply.send(enrichedTests);
      } catch (error) {
        logger.error("Failed to fetch stat tests", {
          runId,
          error: error instanceof Error ? error.message : String(error),
        });
        return reply.code(500).send({ message: "Failed to fetch statistical tests" });
      }
    },
  );

  /**
   * GET /api/stats/tests/:id
   * Get a specific statistical test by ID
   */
  app.get(
    "/api/stats/tests/:id",
    async (
      request: FastifyRequest<{ Params: StatTestIdParams }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      const testId = Number(request.params.id);

      if (isNaN(testId)) {
        return reply.code(400).send({ message: "Invalid test ID" });
      }

      try {
        const test = await deps.getStatTest(testId);

        if (!test) {
          return reply.code(404).send({ message: "Statistical test not found" });
        }

        let metadata: Record<string, unknown> = {};
        if (test.metadataJson) {
          try {
            metadata = JSON.parse(test.metadataJson) as Record<string, unknown>;
          } catch {
            metadata = {};
          }
        }

        return reply.send({
          id: test.id,
          runId: test.runId,
          testType: test.testType,
          pValue: test.pValue,
          confidenceLevel: test.confidenceLevel,
          inSampleMetric: test.inSampleMetric,
          outSampleMetric: test.outSampleMetric,
          createdAt: test.createdAt,
          metadata,
        });
      } catch (error) {
        logger.error("Failed to fetch stat test", {
          testId,
          error: error instanceof Error ? error.message : String(error),
        });
        return reply.code(500).send({ message: "Failed to fetch statistical test" });
      }
    },
  );
};

async function readParquetRows(
  absolutePath: string,
  columns: string[],
): Promise<Record<string, unknown>[]> {
  const reader = await ParquetReader.openFile(absolutePath);
  try {
    const cursor = reader.getCursor(columns);
    const rows: Record<string, unknown>[] = [];
    let row: Record<string, unknown> | null;
    // eslint-disable-next-line no-cond-assign
    while ((row = await cursor.next())) {
      rows.push(row);
    }
    return rows;
  } finally {
    await reader.close();
  }
}
