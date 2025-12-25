## Purpose

Describe how Crucible Trader’s modules snap together so Phase 0 contributors have a single reference for process boundaries, logging contracts, and storage flows.

## Inputs

- Backtest requests submitted from the UI or CLI.
- Local CSV/Parquet artifacts located under `storage/`.
- Environment config (`.env`, `tsconfig.base.json`, pnpm workspace).

## Outputs

- Fastify API serving `/api/*`.
- Worker manifests plus Parquet artifacts written to `storage/runs/<runId>/`.
- Next.js UI exposing `/runs`, `/new-run`, `/datasets`, `/risk`, `/reports`.

## Invariants

- All services read/write within the repository tree; no external DBs or queues in Phase 0.
- TypeScript strict mode and zod validation guard every boundary.
- JSON logging with `{ts, level, module, msg}` format.

## Example

`/new-run` POST → Fastify validates the payload → ensures datasets exist → enqueues job → worker polls SQLite, runs the engine, and drops `manifest.json` + parquet files before the UI refreshes `/runs`.

## Test Checklist

- `pnpm -w build` + `pnpm -w lint` succeed.
- API responds to `/api/runs` and `/api/runs/:id`.
- Worker writes manifests and artifacts in `storage/runs/`.
