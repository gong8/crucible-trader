## Purpose

Describe the future FastAPI/NumPy stats service so Phase 0 code leaves the proper hooks for permutation tests, bootstraps, and walk-forward analysis.

## Inputs

- Engine artifacts (parquet equity/trade files).
- Configuration for statistical tests (window sizes, shuffles, confidence intervals).
- HTTP requests from the Node API once Phase 2 begins.

## Outputs

- JSON payloads containing p-values, confidence bands, and chart-ready data.
- Diagnostics about how many permutations/bootstraps were executed.

## Invariants

- Every endpoint must be deterministic when seeded.
- Long-running jobs should stream progress or return 202 with polling links (future work).
- Interface should remain JSON-only to simplify SDK bindings.

## Example

`POST /stats/permutation` might accept `{ runId, metric: "sharpe", iterations: 1000 }` and reply with `{ pValue: 0.12, distribution: [...] }`.

## Test Checklist

- Placeholder FastAPI app runs locally (`uvicorn services.stats_pod.main:app`) even without real logic.
- Contracts documented here match the SDK once implemented.
