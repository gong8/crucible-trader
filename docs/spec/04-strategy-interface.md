## Purpose

Define the contract each strategy package must satisfy so the engine can load factories without reflection or unsafe casts.

## Inputs

- `StrategyFactory` functions from `packages/sdk/src/strategies`.
- `StrategyBar` objects generated per timeframe.
- Strategy parameter schemas validated by zod.

## Outputs

- Lifecycle hooks: `onInit`, `onBar`, `onStop`.
- `StrategySignal` objects when conditions trigger.
- Parameter metadata for presets surfaced in the UI.

## Invariants

- Factories are pure: no global state between runs.
- `onBar` returns either `null` or a signal with `side`, `timestamp`, `reason`.
- Each package exports `name` matching the slug used throughout the API/UI.

## Example

`sma_crossover.factory({ fastLength: 20, slowLength: 50 })` returns callbacks that emit buy/sell signals whenever the fast SMA crosses the slow SMA; `strategyPresets` references the same slug so `/new-run` can prefill params.

## Test Checklist

- Type-level tests compile under `pnpm --filter @crucible-trader/sdk build`.
- Manual runs confirm each preset (`sma_crossover`, `momentum`, `mean_reversion`, `breakout`, `chaos_trader`) produces trades with the sample datasets.
