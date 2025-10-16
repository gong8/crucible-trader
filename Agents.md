# agent: crucible trader build agent

## mission

Scaffold and evolve the “Crucible Trader” monorepo according to the master spec at:

- docs/spec/00-master-spec.txt (single source of truth)

## high-level goals

- Phase 0 only: runnable skeleton with strict TypeScript, local-first storage, and docs stubs.
- Keep changes minimal, deterministic, and testable.
- Every deliverable must trace to a section in the master spec.

## ground truth (must read)

- Use docs/spec/00-master-spec.txt as authoritative for architecture, naming, and interfaces.
- When implementing, cite the exact section titles you’re following at the top of each PR/response.

## collaboration contract

- Plan → Propose → Build → Verify.
- Before creating or modifying files, output a FILE PLAN listing exact paths and a one-line purpose for each.
- Do not create files not listed in the FILE PLAN.
- If a new dependency or file seems required, STOP and ask (propose it in the FILE PLAN first).

## constraints

- Languages: TypeScript (Node/Next), C++20 (gRPC), Python (FastAPI) per spec.
- HTTP: Fastify (no Nest).
- UI: Next.js app router. TradingView Lightweight Charts later.
- Storage: Parquet + DuckDB + SQLite (local). No external DB in Phase 0.
- Cross-platform paths: use path.join; no hardcoded separators.
- Determinism: seeded RNG; reproducible runs; write run manifests.
- No Docker in Phase 0.
- Keep outputs small and runnable.

## code standards

- TypeScript strict mode everywhere; no // @ts-ignore in CI.
- Use zod for runtime validation of request payloads.
- JSDoc for all exported functions/classes.
- Logging: JSON lines with {ts, level, module, runId?, msg, ...meta}.
- TODO markers: // TODO[phase-2], // TODO[phase-3], // TODO[phase-4]

## directories (from spec)

- apps/web
- services/api
- services/backtest-worker
- services/quant-cpp
- services/stats-pod
- packages/{engine,data,sdk,risk,metrics,report}
- storage/{runs,datasets,db}
- docs/spec
- ops/{proto,scripts}

## definition of done (phase 0)

- Monorepo compiles: `pnpm -w build` succeeds.
- Dev loop runs: `pnpm -w dev` starts api+worker+web.
- API:
  - POST /api/runs returns { runId }.
  - GET /api/runs/:id returns a stubbed BacktestResult.
- Worker writes `storage/runs/<runId>/manifest.json`.
- Web has /runs and /new-run pages wired to API.
- Docs/spec stubs exist with required headings.
- No extra files or deps beyond plan.

## verification loop

- After each task: run `pnpm -w build`, `pnpm -w lint`, (later) `pnpm -w test`.
- If any error: paste exact console output and propose a minimal fix.

## non-goals (phase 0)

- No Docker, no cloud, no external DBs.
- No full Tiingo/Polygon integration yet (CsvSource is enough).
- No real parquet writing until explicitly requested (place TODOs first).

## initial tasks (from master spec: Phase 0 Deliverables)

1. root scaffolding: .gitignore, pnpm-workspace.yaml, tsconfig.base.json, root package.json, eslint/prettier, .editorconfig.
2. workspaces: create folders + minimal package.json + tsconfig + src/index.ts for TS packages.
3. api server stub (Fastify), in-proc queue, runs routes.
4. worker stub: consumes queue, writes manifest.
5. sdk: types + zod schemas (`BacktestRequest`, etc.).
6. engine skeleton: accepts request, stub metrics in summary.
7. data: `IDataSource` and `CsvSource` (mocked).
8. apps/web: /runs and /new-run with JSON preview.
9. docs: create stubs under docs/spec/\* with headings.

## commands (assume pnpm)

- install: `pnpm i -w`
- build: `pnpm -w build`
- lint: `pnpm -w lint`
- dev: `pnpm -w dev`

## error policy

- Never silently skip an error. Show exact message and its file path.
- Prefer smallest viable change that fixes the error.
- Ask before wide refactors or adding deps.

## security & hygiene

- Never write secrets to the repo. Use .env.example with placeholders.
- Add LLM prompt files to .gitignore (/\_prompts, \*.prompt.txt, chat notes).
- Keep storage artifacts (.parquet, /runs) out of git.

## success signal

At the end, print a short checklist with:

- created files
- commands to run
- expected endpoints and pages
