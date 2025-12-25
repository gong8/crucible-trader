# Claude Code Guide: Crucible Trader

## Project Overview

Crucible Trader is a backtesting framework for algorithmic trading strategies. Built as a TypeScript monorepo using pnpm workspaces, it provides deterministic, reproducible backtests with comprehensive metrics and risk management.

## Master Specification

The single source of truth for architecture, naming, and interfaces:

- `docs/spec/00-master-spec.txt`

Always reference the master spec when implementing features or making architectural decisions.

## Codebase Structure

### Core Packages (`packages/`)

- **engine**: Backtest simulation engine with strategy execution
- **data**: Data source abstraction (CSV, Tiingo, Polygon)
- **sdk**: Shared TypeScript types and schemas (zod-based)
- **metrics**: Performance metrics calculation (Sharpe, Sortino, etc.)
- **risk**: Risk management and position sizing
- **report**: Markdown report generation
- **logger**: Structured JSON logging

### Services (`services/`)

- **api**: Fastify HTTP API for backtest submission
- **backtest-worker**: Worker process for async backtest execution
- **quant-cpp**: C++20 gRPC service for quantitative analysis (Phase 2+)
- **stats-pod**: Python FastAPI service for statistical analysis (Phase 2+)

### Applications (`apps/`)

- **web**: Next.js web interface for creating and viewing backtests

### Storage (`storage/`)

- **runs/**: Backtest results (Parquet files, reports, manifests)
- **datasets/**: CSV market data files
- **db/**: SQLite databases

## Development Workflow

### Common Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -w build

# Run linting
pnpm -w lint

# Run all tests
pnpm test

# Start development servers
pnpm -w dev
```

### Testing

- **Unit tests**: Each package has its own test suite
- **Integration tests**: Engine tests validate end-to-end workflows
- **Run tests**: `pnpm --filter <package-name> test`
- **Test framework**: Node.js built-in test runner with TypeScript

### Package-Specific Testing

```bash
# Data package tests (62 tests)
pnpm --filter @crucible-trader/data test

# Engine tests (integration tests)
pnpm --filter @crucible-trader/engine test

# API tests (queue, database, routes)
pnpm --filter @crucible-trader/api test

# Metrics tests
pnpm --filter @crucible-trader/metrics test
```

## Code Standards

### TypeScript

- **Strict mode enabled**: No `@ts-ignore` allowed in CI
- **ESM modules**: All packages use `"type": "module"`
- **Explicit extensions**: Import paths must include `.js` extension
- **No relative parent imports**: Use workspace dependencies

### Documentation

- **JSDoc**: Required for all exported functions and classes
- **Type annotations**: Explicit return types for public APIs
- **Comments**: Explain "why", not "what"

### Logging

All logs use structured JSON format:

```typescript
{
  ts: "2024-01-01T00:00:00.000Z",
  level: "info" | "warn" | "error",
  module: "@crucible-trader/engine",
  runId: "optional-run-id",
  msg: "Human-readable message",
  ...meta  // Additional context
}
```

### Determinism

- **Seeded RNG**: All randomness uses seeded generators
- **Reproducible runs**: Same seed = same results
- **Run manifests**: Each backtest writes metadata to `storage/runs/<runId>/manifest.json`

## Architecture Patterns

### Data Flow

1. **Request**: User submits `BacktestRequest` via API
2. **Queue**: API enqueues job in SQLite database
3. **Worker**: Worker polls queue and executes backtest
4. **Engine**: Loads data, runs strategy, calculates metrics
5. **Storage**: Writes Parquet files + report + manifest
6. **Response**: Returns `BacktestResult` with artifacts

### Data Sources

```typescript
interface IDataSource {
  id: string;
  loadBars(request: DataRequest): Promise<ReadonlyArray<Bar>>;
}
```

**Implementations:**

- `CsvSource`: Local CSV files in `storage/datasets/`
- `TiingoSource`: Tiingo API integration with caching
- `PolygonSource`: Polygon.io API integration with caching

**Caching Strategy:**

- Cache key: `symbol_timeframe_adjusted.json`
- Cache location: Per-source cache directories
- TTL-based invalidation

### Risk Management

```typescript
interface RiskProfile {
  id: string;
  name: string;
  maxDailyLossPct: number; // Max daily loss (e.g., 0.03 = 3%)
  maxPositionPct: number; // Max position size (e.g., 0.2 = 20%)
  perOrderCapPct: number; // Per-order cap (e.g., 0.1 = 10%)
  globalDDKillPct: number; // Kill switch threshold (e.g., 0.05 = 5%)
  cooldownMinutes: number; // Cooldown after violation
}
```

## Common Tasks

### Adding a New Data Source

1. Implement `IDataSource` interface in `packages/data/src/`
2. Add unit tests in `packages/data/test/`
3. Register in engine's `loadBarsBySymbol()` function
4. Update SDK types if needed

### Adding a New Metric

1. Add calculation in `packages/metrics/src/`
2. Update `MetricKey` type in `packages/sdk/src/types.ts`
3. Add tests in `packages/metrics/test/`
4. Update report template to include new metric

### Creating a New Strategy

1. Define strategy in `packages/sdk/src/strategies/`
2. Implement in `packages/engine/src/strategies/`
3. Register in `instantiateStrategy()` function
4. Add integration test in `packages/engine/test/`

## Testing Guidelines

### Test Structure

```typescript
import test from "node:test";
import assert from "node:assert/strict";

test("descriptive test name", async (t) => {
  // Setup
  const input = createTestData();

  // Execute
  const result = await functionUnderTest(input);

  // Assert
  assert.equal(result.expected, value);

  // Cleanup (if needed)
  t.after(async () => {
    await cleanup();
  });
});
```

### Test Best Practices

- **Isolated**: Each test should be independent
- **Deterministic**: No reliance on external state or timing
- **Fast**: Unit tests should run in milliseconds
- **Descriptive**: Test names should clearly state what's being tested
- **Cleanup**: Always clean up temp files and resources

### Mocking External Dependencies

```typescript
class FakeHttpClient implements HttpClient {
  public calls: string[] = [];

  public constructor(private readonly responseBody: string) {}

  public async get(url: string): Promise<HttpResponse> {
    this.calls.push(url);
    return {
      statusCode: 200,
      body: this.responseBody,
      headers: {},
    };
  }
}
```

## Known Issues & Workarounds

### Module Loading with ts-node

**Issue**: Some test files fail with `[Object: null prototype]` error when using `ts-node/esm` loader.

**Workaround**: Compile tests to JavaScript first:

```json
{
  "scripts": {
    "test": "tsc -p tsconfig.test.json && node --test dist-test/**/*.test.js"
  }
}
```

### Cache Key Design

**Important**: Cache keys for data sources DO NOT include start/end dates. This allows:

- Fetching data once and filtering for different date ranges
- Reduced API calls to external data providers
- Faster backtest execution

**Cache Key Format**: `{symbol}_{timeframe}_{adjusted}.json`

Example:

- Request 1: AAPL 1d 2024-01-01 to 2024-12-31
- Request 2: AAPL 1d 2024-06-01 to 2024-08-31
- Both use same cache: `aapl_1d_adj.json`

## Error Handling

### Data Source Errors

```typescript
// CsvSource: Throws ENOENT when file doesn't exist
await csvSource.loadBars(request); // throws if CSV missing

// TiingoSource: Throws on HTTP errors
await tiingoSource.loadBars(request); // throws if API fails

// PolygonSource: Throws on HTTP errors
await polygonSource.loadBars(request); // throws if API fails
```

### Engine Validation

```typescript
// Validates before running backtest
if (bars.length === 0) {
  throw new Error(`No bars loaded for ${symbol} ${timeframe}`);
}

if (!isValidStrategy(request.strategy.name)) {
  throw new Error(`Unknown strategy: ${request.strategy.name}`);
}
```

## Security & Hygiene

### Environment Variables

- **Never commit secrets**: Use `.env.example` with placeholders
- **API keys**: Store in `.env` file (git-ignored)
- **Required vars**: `TIINGO_API_KEY`, `POLYGON_API_KEY`

### Git Ignore

```
.env
storage/runs/
storage/datasets/*.csv
storage/datasets/.cache/
storage/db/*.sqlite
storage/db/*.sqlite-wal
storage/db/*.sqlite-shm
```

### Sensitive Data

- **Never log API keys or secrets**
- **Redact tokens in error messages**
- **Sanitize user inputs before logging**

## CI/CD

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
- Build all packages
- Run linting
- Run all tests
- Report results
```

**Status**: Currently running on push to `main` and pull requests.

### Branch Protection

Configure required status checks:

- ✅ Build success
- ✅ Lint passes
- ✅ All tests pass

## Troubleshooting

### Build Failures

```bash
# Clean build artifacts
rm -rf packages/*/dist services/*/dist apps/*/dist

# Reinstall dependencies
rm -rf node_modules packages/*/node_modules
pnpm install

# Rebuild
pnpm -w build
```

### Test Failures

```bash
# Run specific package tests with verbose output
pnpm --filter @crucible-trader/data test 2>&1 | less

# Check for stale compiled tests
rm -rf packages/engine/dist-test
pnpm --filter @crucible-trader/engine test
```

### Type Errors

```bash
# Check TypeScript errors across all packages
pnpm -r exec tsc --noEmit

# Fix specific package
cd packages/data
tsc --noEmit
```

## Performance Considerations

### Backtest Execution

- **Streaming**: Process bars sequentially to minimize memory
- **Caching**: Aggressive caching of data sources
- **Parquet**: Columnar storage for efficient artifact writes

### Data Loading

- **CSV**: Cached after first load, keyed by file mtime
- **API sources**: HTTP responses cached with TTL
- **Filtering**: Happens after caching, not before

## Future Phases (Not Implemented Yet)

### Phase 1

- Live API integration
- Real-time data streaming
- WebSocket support

### Phase 2

- C++20 gRPC service for HFT signals
- Advanced optimization algorithms

### Phase 3

- Paper trading mode
- Risk monitoring dashboard

### Phase 4

- Production deployment
- Cloud infrastructure
- Horizontal scaling

## Getting Help

### Documentation

- `docs/spec/00-master-spec.txt` - Architecture and requirements
- `TESTING.md` - Test suite documentation
- `TEST_RESULTS.md` - Current test status
- `CI_CD.md` - CI/CD pipeline documentation

### Code Navigation

- Use LSP (Language Server Protocol) for jump-to-definition
- Follow explicit import paths (`.js` extensions)
- Check `package.json` exports for public APIs

### Common Patterns

Look at existing implementations:

- **Data source**: See `CsvSource.ts`, `TiingoSource.ts`
- **Strategy**: See `packages/engine/src/strategies/`
- **Tests**: See `packages/*/test/` directories
- **API routes**: See `services/api/src/routes/`

## Success Criteria

### Phase 0 (Current)

- ✅ Monorepo builds successfully
- ✅ All data tests pass (62/62)
- ⚠️ Engine tests mostly pass (4/12 passing)
- ✅ API can submit and track backtests
- ✅ Worker processes backtest queue
- ✅ Reports generated in Markdown
- ✅ Artifacts written to Parquet

### Quality Gates

- **Zero** TypeScript errors in strict mode
- **Zero** ESLint warnings in CI
- **High** test coverage (target: 80%+)
- **Fast** builds (<10 seconds for incremental)
- **Deterministic** test results (no flaky tests)
