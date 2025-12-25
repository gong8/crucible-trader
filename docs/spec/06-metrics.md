## Purpose

Define the Phase 0 metric set so engines, reports, and UI cards are aligned on naming/units.

## Inputs

- Equity curve + trades emitted by the engine.
- Requested metric list from `BacktestRequest.metrics`.
- Fees/slippage captured alongside trades.

## Outputs

- Summary map containing Sharpe, Sortino, Max Drawdown, CAGR, Win Rate, Total PnL, Total Return, Number of Trades, Profit Factor.
- Artifact files (parquet) for equity/trades/bars used for downstream analytics.

## Invariants

- Metrics are deterministic for a given dataset/seed.
- Required metrics are always included even if request omits them.
- Division-by-zero cases (e.g., Profit Factor) resolve to `Infinity` or `0`.

## Example

After running `msft_hourly_demo`, `summary.sharpe` might equal `1.12` and `summary.winrate` `0.5`. The `/runs` UI reads the JSON and renders the same values.

## Test Checklist

- `packages/metrics` builds with strict TS checks.
- Integration test verifies summary data appears after `/api/runs` POST.
