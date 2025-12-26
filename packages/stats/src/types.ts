/**
 * Statistical validation types for Crucible Trader
 */

export interface PermutationTestConfig {
  /** Number of permutation iterations to run */
  readonly iterations: number;
  /** Metric to test (e.g., 'sharpe', 'sortino', 'total_return') */
  readonly metric: string;
  /** Random seed for reproducibility */
  readonly seed: number;
  /** Significance level (e.g., 0.05 for 95% confidence) */
  readonly alpha?: number;
}

export interface PermutationTestResult {
  /** ID of the test */
  readonly testId: string;
  /** Original metric value from the backtest */
  readonly originalMetric: number;
  /** p-value: proportion of permuted results >= original */
  readonly pValue: number;
  /** Whether result is statistically significant at alpha level */
  readonly isSignificant: boolean;
  /** Significance level used */
  readonly alpha: number;
  /** Distribution of permuted metric values */
  readonly nullDistribution: readonly number[];
  /** Mean of null distribution */
  readonly nullMean: number;
  /** Standard deviation of null distribution */
  readonly nullStdDev: number;
  /** Z-score of original metric */
  readonly zScore: number;
}

export interface BootstrapConfig {
  /** Number of bootstrap samples */
  readonly iterations: number;
  /** Metric to bootstrap */
  readonly metric: string;
  /** Confidence level (e.g., 0.95 for 95% CI) */
  readonly confidenceLevel: number;
  /** Random seed for reproducibility */
  readonly seed: number;
}

export interface BootstrapResult {
  /** ID of the test */
  readonly testId: string;
  /** Metric being analyzed */
  readonly metric: string;
  /** Point estimate (original value) */
  readonly pointEstimate: number;
  /** Lower bound of confidence interval */
  readonly ciLower: number;
  /** Upper bound of confidence interval */
  readonly ciUpper: number;
  /** Standard error from bootstrap */
  readonly standardError: number;
  /** Confidence level */
  readonly confidenceLevel: number;
  /** Bootstrap distribution */
  readonly bootstrapDistribution: readonly number[];
}

export interface Trade {
  readonly time: string;
  readonly side: "buy" | "sell";
  readonly price: number;
  readonly qty: number;
  readonly pnl: number;
}

export interface EquityPoint {
  readonly time: string;
  readonly equity: number;
}
