## Purpose

Describe the Fastify surface so the UI/CLI knows exactly how to interact with `/api/runs`, `/api/datasets`, and `/api/risk-profiles`.

## Inputs

- HTTP JSON payloads validated through zod and SDK schemas.
- Environment-provided origins for CORS headers.
- Local SQLite database for persistence.

## Outputs

- Run IDs, summaries, and artifacts served via REST routes.
- Dataset registrations that mirror `storage/datasets`.
- Risk profile CRUD endpoints.

## Invariants

- All responses include informative error bodies (`{ message }`).
- CORS headers echo the `Origin` header except for OPTIONS preflight.
- Dataset fetch route never mutates files outside `storage/datasets`.

## Example

`POST /api/runs` with `source:"auto"` ensures datasets exist (creating CSVs if missing), inserts a queued run, enqueues the job, and returns `{ runId }`. `GET /api/runs/:id` later resolves the manifest/DB record.

## Test Checklist

- `services/api/test/runs.e2e.test.ts` passes.
- Manual curl to `/api/datasets/fetch` returns metadata for both CSV and remote fetches.
