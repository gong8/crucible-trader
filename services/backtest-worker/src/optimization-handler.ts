/**
 * Handles optimization job execution for the backtest worker.
 */

import { runBacktest } from "@crucible-trader/engine";
import type {
  BacktestRequest,
  OptimizationCombinationResult,
  MetricKey,
  ParamGrid,
} from "@crucible-trader/sdk";
import {
  expandParamGrid,
  calculateRobustnessScore,
  generateWalkForwardWindows,
  type WalkForwardConfig,
  type WalkForwardWindow,
} from "@crucible-trader/stats";
import type { createLogger } from "@crucible-trader/logger";
import type { createApiDatabase } from "@crucible-trader/api/db";

type WorkerDatabase = Pick<
  Awaited<ReturnType<typeof createApiDatabase>>,
  "getRiskProfileById" | "updateOptimization"
>;

export interface OptimizationJob {
  readonly optId: string;
  readonly name: string;
  readonly strategyName: string;
  readonly paramGridJson: string;
  readonly objective: MetricKey;
  readonly constraintsJson: string | null;
  readonly walkForwardConfigJson: string | null;
  readonly bootstrapIterations: number | null;
  readonly permutationIterations: number | null;
  readonly seed: number | null;
  readonly baseRequestJson: string;
}

export interface OptimizationHandlerDeps {
  readonly database: WorkerDatabase;
  readonly runBacktest: typeof runBacktest;
  readonly logger: ReturnType<typeof createLogger>;
}

/**
 * Executes a single parameter combination backtest.
 */
async function runCombination(
  params: Record<string, number>,
  baseRequest: Omit<BacktestRequest, "strategy">,
  strategyName: string,
  objective: MetricKey,
  constraints: {
    minTrades?: number;
    maxDrawdown?: number;
    minScore?: number;
  },
  seed: number,
  deps: OptimizationHandlerDeps,
): Promise<OptimizationCombinationResult> {
  const request: BacktestRequest = {
    ...baseRequest,
    strategy: {
      name: strategyName,
      params,
    },
    seed,
  };

  let riskProfile;
  if (baseRequest.riskProfileId) {
    riskProfile = await deps.database.getRiskProfileById(baseRequest.riskProfileId);
  }

  const result = await deps.runBacktest(request, { riskProfile });
  const metrics = result.summary;
  const score = metrics[objective] ?? 0;

  // Check constraints
  const violations: string[] = [];
  const numTrades = metrics.num_trades ?? 0;
  const maxDrawdown = metrics.max_dd ?? 0;

  if (constraints.minTrades && numTrades < constraints.minTrades) {
    violations.push(`Too few trades: ${numTrades} < ${constraints.minTrades}`);
  }
  if (constraints.maxDrawdown && maxDrawdown < constraints.maxDrawdown) {
    violations.push(`Drawdown too large: ${maxDrawdown} < ${constraints.maxDrawdown}`);
  }
  if (constraints.minScore && score < constraints.minScore) {
    violations.push(`Score too low: ${score} < ${constraints.minScore}`);
  }

  // Calculate robustness score
  const robustnessScore = calculateRobustnessScore({
    objectiveScore: score,
    maxDrawdown: metrics.max_dd ?? 0,
    numTrades: metrics.num_trades ?? 0,
    constraints: {
      maxDrawdownThreshold: constraints.maxDrawdown,
      minTradesThreshold: constraints.minTrades,
    },
  });

  return {
    params,
    metrics,
    score,
    robustnessScore,
    runId: result.runId,
    violations: violations.length > 0 ? violations : undefined,
  };
}

/**
 * Runs a single walk-forward window.
 */
async function runWalkForwardWindow(
  window: WalkForwardWindow,
  paramGrid: ParamGrid,
  baseRequest: Omit<BacktestRequest, "strategy">,
  strategyName: string,
  objective: MetricKey,
  constraints: {
    minTrades?: number;
    maxDrawdown?: number;
    minScore?: number;
  },
  seed: number,
  deps: OptimizationHandlerDeps,
): Promise<{
  windowIndex: number;
  inSample: { start: string; end: string };
  outSample: { start: string; end: string };
  bestParams: Record<string, number>;
  inSampleScore: number;
  outSampleScore: number;
  inSampleMetrics: Record<string, number>;
  outSampleMetrics: Record<string, number>;
}> {
  // Run all combinations on in-sample period
  const inSampleRequest = {
    ...baseRequest,
    data: baseRequest.data.map((d) => ({
      ...d,
      start: window.inSample.start,
      end: window.inSample.end,
    })),
  };

  const combinations = expandParamGrid(paramGrid);
  const inSampleResults: OptimizationCombinationResult[] = [];

  for (const params of combinations) {
    try {
      const result = await runCombination(
        params,
        inSampleRequest,
        strategyName,
        objective,
        constraints,
        seed,
        deps,
      );
      inSampleResults.push(result);
    } catch (error) {
      deps.logger.warn("Combination failed in IS period", {
        params,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Find best parameters from in-sample
  const validResults = inSampleResults.filter((r) => !r.violations || r.violations.length === 0);
  if (validResults.length === 0) {
    throw new Error("No valid parameter combinations found in in-sample period");
  }

  const bestInSample = validResults.reduce((best, current) =>
    (current.robustnessScore ?? current.score) > (best.robustnessScore ?? best.score)
      ? current
      : best,
  );

  // Test best parameters on out-of-sample period
  const outSampleRequest = {
    ...baseRequest,
    data: baseRequest.data.map((d) => ({
      ...d,
      start: window.outSample.start,
      end: window.outSample.end,
    })),
  };

  const outSampleResult = await runCombination(
    bestInSample.params,
    outSampleRequest,
    strategyName,
    objective,
    constraints,
    seed,
    deps,
  );

  return {
    windowIndex: window.windowIndex,
    inSample: window.inSample,
    outSample: window.outSample,
    bestParams: bestInSample.params,
    inSampleScore: bestInSample.score,
    outSampleScore: outSampleResult.score,
    inSampleMetrics: bestInSample.metrics ?? {},
    outSampleMetrics: outSampleResult.metrics ?? {},
  };
}

/**
 * Main optimization job handler.
 */
export const createOptimizationHandler =
  (deps: OptimizationHandlerDeps) =>
  async (job: OptimizationJob): Promise<void> => {
    deps.logger.info("Processing optimization job", { optId: job.optId });

    try {
      await deps.database.updateOptimization(job.optId, {
        status: "running",
      });

      const paramGrid = JSON.parse(job.paramGridJson);
      const baseRequest = JSON.parse(job.baseRequestJson);
      const constraints = job.constraintsJson ? JSON.parse(job.constraintsJson) : {};
      const walkForwardConfig: WalkForwardConfig | null = job.walkForwardConfigJson
        ? JSON.parse(job.walkForwardConfigJson)
        : null;

      const combinations = expandParamGrid(paramGrid);
      const seed = job.seed ?? 42;

      deps.logger.info("Running optimization", {
        optId: job.optId,
        totalCombinations: combinations.length,
        hasWalkForward: !!walkForwardConfig,
      });

      // If walk-forward is enabled, run walk-forward analysis
      if (walkForwardConfig) {
        const windows = generateWalkForwardWindows({
          start: baseRequest.data[0].start,
          end: baseRequest.data[0].end,
          inSampleMonths: walkForwardConfig.inSampleMonths,
          outSampleMonths: walkForwardConfig.outSampleMonths,
          anchored: walkForwardConfig.anchored,
        });

        const windowResults = [];
        const windowExecutionTimes: number[] = [];

        for (let i = 0; i < windows.length; i++) {
          const window = windows[i];
          if (!window) {
            deps.logger.warn("Skipping undefined window", { index: i });
            continue;
          }

          const windowStartTime = Date.now();

          deps.logger.info("Processing walk-forward window", {
            optId: job.optId,
            windowIndex: window.windowIndex,
            progress: `${i + 1}/${windows.length}`,
          });

          const result = await runWalkForwardWindow(
            window,
            paramGrid,
            baseRequest,
            job.strategyName,
            job.objective,
            constraints,
            seed,
            deps,
          );
          windowResults.push(result);

          // Track execution time
          const execTime = Date.now() - windowStartTime;
          windowExecutionTimes.push(execTime);

          // Update progress
          const avgTime =
            windowExecutionTimes.reduce((a, b) => a + b, 0) / windowExecutionTimes.length;
          const remaining = windows.length - (i + 1);
          const estimatedTimeMs = Math.round(avgTime * remaining);

          await deps.database.updateOptimization(job.optId, {
            completedCombinations: i + 1,
            estimatedTimeRemainingMs: estimatedTimeMs,
          });

          deps.logger.info("Walk-forward progress update", {
            optId: job.optId,
            completedWindows: i + 1,
            totalWindows: windows.length,
            estimatedRemainingMs: estimatedTimeMs,
          });
        }

        // Check if any windows were generated
        if (windowResults.length === 0) {
          throw new Error(
            `No walk-forward windows generated. Date range too short for in-sample (${job.walkForwardConfigJson ? JSON.parse(job.walkForwardConfigJson).inSampleMonths : 12}mo) + out-of-sample (${job.walkForwardConfigJson ? JSON.parse(job.walkForwardConfigJson).outSampleMonths : 3}mo) periods.`,
          );
        }

        // Calculate aggregate OOS metrics
        const oosScores = windowResults.map((w) => w.outSampleScore);
        const avgOOSScore = oosScores.reduce((a, b) => a + b, 0) / oosScores.length;

        // Find the most frequently selected parameters across windows
        const paramCounts = new Map<string, number>();
        for (const window of windowResults) {
          const key = JSON.stringify(window.bestParams);
          paramCounts.set(key, (paramCounts.get(key) ?? 0) + 1);
        }

        const mostCommonParams = Array.from(paramCounts.entries()).reduce(
          (best, current) => (current[1] > best[1] ? current : best),
          ["", 0] as [string, number],
        );

        const bestParams = JSON.parse(mostCommonParams[0]) as Record<string, number>;

        await deps.database.updateOptimization(job.optId, {
          status: "completed",
          bestParamsJson: JSON.stringify(bestParams),
          bestScore: avgOOSScore,
          walkForwardResultsJson: JSON.stringify({
            windows: windowResults,
            aggregateOOS: {
              score: avgOOSScore,
              metrics: { [job.objective]: avgOOSScore },
            },
          }),
          completedAt: new Date().toISOString(),
        });
      } else {
        // Standard grid search without walk-forward
        const allResults: OptimizationCombinationResult[] = [];
        const executionTimes: number[] = [];
        const updateInterval = 5; // Update progress every 5 combinations

        for (let i = 0; i < combinations.length; i++) {
          const params = combinations[i];
          if (!params) {
            deps.logger.warn("Skipping undefined params", { index: i });
            continue;
          }

          const combStartTime = Date.now();

          deps.logger.info("Testing combination", {
            optId: job.optId,
            progress: `${i + 1}/${combinations.length}`,
            params,
          });

          try {
            const result = await runCombination(
              params,
              baseRequest,
              job.strategyName,
              job.objective,
              constraints,
              seed,
              deps,
            );
            allResults.push(result);

            // Track execution time
            const execTime = Date.now() - combStartTime;
            executionTimes.push(execTime);
          } catch (error) {
            deps.logger.warn("Combination failed", {
              params,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Update progress periodically
          if ((i + 1) % updateInterval === 0 || i === combinations.length - 1) {
            const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
            const remaining = combinations.length - (i + 1);
            const estimatedTimeMs = Math.round(avgTime * remaining);

            await deps.database.updateOptimization(job.optId, {
              completedCombinations: i + 1,
              estimatedTimeRemainingMs: estimatedTimeMs,
            });

            deps.logger.info("Progress update", {
              optId: job.optId,
              completed: i + 1,
              total: combinations.length,
              estimatedRemainingMs: estimatedTimeMs,
              avgTimePerCombinationMs: Math.round(avgTime),
            });
          }
        }

        // Find best parameter set
        const validResults = allResults.filter((r) => !r.violations || r.violations.length === 0);

        if (validResults.length === 0) {
          // No valid combinations - save results with violations for analysis
          const sampleViolations = allResults.slice(0, 5).map((r) => ({
            params: r.params,
            violations: r.violations,
            score: r.score,
            metrics: r.metrics,
          }));

          deps.logger.warn("No valid parameter combinations found", {
            optId: job.optId,
            totalTested: allResults.length,
            sampleViolations,
          });

          // Save all results for user to analyze what went wrong
          await deps.database.updateOptimization(job.optId, {
            status: "completed",
            resultsJson: JSON.stringify(allResults),
            errorMessage: `No valid combinations found. All ${allResults.length} combinations violated constraints. Check constraints and try again.`,
            completedAt: new Date().toISOString(),
          });

          deps.logger.info("Optimization completed with no valid results", {
            optId: job.optId,
            totalCombinations: allResults.length,
          });
          return;
        }

        const bestResult = validResults.reduce((best, current) =>
          (current.robustnessScore ?? current.score) > (best.robustnessScore ?? best.score)
            ? current
            : best,
        );

        await deps.database.updateOptimization(job.optId, {
          status: "completed",
          bestParamsJson: JSON.stringify(bestResult.params),
          bestScore: bestResult.score,
          bestRobustnessScore: bestResult.robustnessScore,
          resultsJson: JSON.stringify(allResults),
          completedAt: new Date().toISOString(),
        });

        deps.logger.info("Optimization completed", {
          optId: job.optId,
          bestParams: bestResult.params,
          bestScore: bestResult.score,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      deps.logger.error("Optimization failed", {
        optId: job.optId,
        error: errorMessage,
      });

      await deps.database.updateOptimization(job.optId, {
        status: "failed",
        errorMessage,
        completedAt: new Date().toISOString(),
      });

      throw error;
    }
  };
