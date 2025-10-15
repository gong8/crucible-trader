/**
 * Describes the backtest worker scaffold for Phase 0.
 */
export const describeBacktestWorker = (): Record<string, string> => {
  return {
    module: 'services/backtest-worker',
    status: 'ready',
  };
};

console.info(
  JSON.stringify({
    ts: '1970-01-01T00:00:00.000Z',
    level: 'info',
    module: 'services/backtest-worker',
    msg: 'Phase 0 scaffold ready',
  })
);
