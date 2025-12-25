## Purpose

Capture the default guardrails (max drawdowns, per-order caps, kill switch) and persistence format for editing risk profiles through the API.

## Inputs

- JSON payloads from `/api/risk-profiles`.
- Defaults defined inside `services/api/src/db/index.ts`.
- Engine runtime options (`runBacktest` riskProfile argument).

## Outputs

- Stored profiles in SQLite (`risk_profiles` table).
- Normalised limits passed to the engine before a run starts.
- UI forms on `/risk` for editing values.

## Invariants

- Percentages are stored as fractions (0.03 = 3%).
- Every profile includes `id`, `name`, and all limit fields.
- Engine clamps absurd values (e.g., never allows 0% max position).

## Example

`risk_profiles` row for `default` ensures `maxDailyLossPct=0.03`, `perOrderCapPct=0.1`, `globalDDKillPct=0.05`. When `/api/runs` receives `riskProfileId: "default"`, the same structure is forwarded to `runBacktest`.

## Test Checklist

- DB unit tests can insert/update/list profiles.
- Manual API call `POST /api/risk-profiles` followed by `/api/runs` shows overrides flowing into manifests.
