## Purpose

Provide a deterministic single-threaded simulator that consumes OHLCV bars, strategy factories, and risk limits to produce metrics plus artifact parquet files.

## Inputs

- `BacktestRequest` objects (strategy slug, params, metrics, cost assumptions).
- Sanitised OHLCV bars grouped by symbol.
- Optional `RiskProfile` overrides supplied by the API/worker.

## Outputs

- Equity curve, trades, and deduped bars written through the persistence helpers.
- Summary metrics (`sharpe`, `sortino`, `max_dd`, `cagr`, `winrate`, etc.).
- Diagnostics object (seed, processed bars, requested metrics, run metadata).

## Invariants

- RNG seed defaults to 42 unless provided.
- Engine stops on kill switch drawdown or max daily loss conditions.
- No mutation of strategy params; every callback receives a clean context.

## Example

Engine loads `MSFT 1h` bars, instantiates `sma_crossover`, executes across 8 hourly candles, emits a Sharpe/Sortino summary, and serializes parquet artifacts into `storage/runs/run-id/`.

## Test Checklist

- Unit tests for CSV data source cover de-dupe, sorting, cache invalidation.
- Integration test (services/api/test/runs.e2e.test.ts) submits a run and verifies a completed result.
- Manual smoke: `pnpm --filter @crucible-trader/engine build && node dist/engine.js` (as required) succeeds.
