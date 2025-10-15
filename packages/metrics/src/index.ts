/**
 * Captures the metric names required for Phase 0 reporting.
 */
export interface MetricSet {
  readonly metrics: string[];
}

/**
 * Supplies the canonical placeholder metric set.
 */
export const createMetricSet = (): MetricSet => {
  return {
    metrics: ['sharpe', 'sortino', 'maxDrawdown', 'cagr', 'winRate'],
  };
};
