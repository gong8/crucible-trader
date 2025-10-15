/**
 * Describes the minimal configuration for initiating a backtest request.
 */
export interface BacktestRequest {
  readonly name: string;
}

/**
 * Produces a canonical placeholder request for testing integrations.
 */
export const createBacktestRequest = (name: string): BacktestRequest => {
  return {
    name,
  };
};
