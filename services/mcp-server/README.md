# Crucible Trader MCP Server

Model Context Protocol (MCP) server that exposes Crucible Trader functionality to AI assistants like Claude.

## Overview

The MCP server provides programmatic access to:

- **Backtest operations**: Submit, query, and manage backtests
- **Data queries**: List datasets, data sources, and timeframes
- **Strategy management**: List and inspect trading strategies
- **Metrics & analysis**: Calculate metrics and compare backtests
- **Optimization**: Run parameter optimization jobs
- **Testing**: Run tests, linting, and builds

## Installation

```bash
# From repository root
cd services/mcp-server
pnpm install
pnpm build
```

## Usage

### With Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "crucible-trader": {
      "command": "node",
      "args": ["/path/to/crucible-trader/services/mcp-server/dist/index.js"]
    }
  }
}
```

### Standalone

```bash
pnpm start
```

The server defaults to stdio transport (Claude Desktop friendly).

For HTTP (Capsule and other MCP HTTP clients):

```bash
MCP_TRANSPORT=http MCP_PORT=3012 pnpm start
```

Then use `http://localhost:3012/mcp`.

#### HTTP Flow

1. `POST /mcp` with `Content-Type: application/json`, `Accept: application/json, text/event-stream`, and the JSON-RPC body `{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"capsule","version":"1.0"}},"id":1}`.
2. Capture the `mcp-session-id` from the response headers (`initialize` returns it in `mcp-session-id`), then reuse that header on every subsequent request.
3. Issue tool calls with method `tools/call`, wrapping your payload as `{"params":{"name":"submit_backtest","arguments":{"request":{…BacktestRequest…}}}}`.
4. `/mcp` also responds to GET with JSON describing the HTTP transport and supported protocols—use it as a lightweight health check before sending tool calls.
5. Stream live progress by hitting `GET /mcp/progress?runId=<runId>` with `Accept: text/event-stream`; events (`progress`, `complete`, `error`) include status, summary, and timing metadata.

If you prefer streaming-friendly clients (Claude Desktop, Cursor, etc.), run without `MCP_TRANSPORT=http` to keep the stdio transport; the server defaults to stdio for compatibility.

## Available Tools

### Backtest Operations

#### `submit_backtest`

Submit a new backtest request to the engine.

**Parameters:**

- `request` (object): BacktestRequest with runName, data, strategy, costs, initialCash, etc.

**Returns:** Success response with run ID and results (backtests run synchronously)

**Response Format:**

```json
{
  "success": true,
  "runId": "54e24bbf-e437-4773-8c08-a900337bf938",
  "status": "completed",
  "executionTimeMs": 1234,
  "summary": { "sharpe": 1.28, "total_return": 0.0426, ... },
  "message": "Backtest completed successfully. Use get_backtest_results for full details."
}
```

**Error Response Format:**

```json
{
  "success": false,
  "runId": "...",
  "error": "Specific error description",
  "details": "Full error message",
  "fix": "Actionable guidance"
}
```

**Request Example:**

```json
{
  "request": {
    "runName": "SMA Crossover Test",
    "data": [
      {
        "source": "auto",
        "symbol": "AAPL",
        "timeframe": "1d",
        "start": "2023-01-01",
        "end": "2023-12-31",
        "adjusted": true
      }
    ],
    "strategy": {
      "name": "sma_crossover",
      "params": {
        "fastPeriod": 10,
        "slowPeriod": 30
      }
    },
    "costs": {
      "feeBps": 5,
      "slippageBps": 2
    },
    "initialCash": 100000,
    "seed": 42
  }
}
```

#### `get_backtest_status`

Get current status of a backtest.

**Parameters:**

- `runId` (string): Run ID from submit_backtest

#### `get_backtest_results`

Get full results including metrics and artifact paths.

**Parameters:**

- `runId` (string): Run ID

#### `list_backtests`

List all backtests with optional status filter.

**Parameters:**

- `status` (string, optional): Filter by status (queued, running, completed, failed)
- `limit` (number, optional): Max results (default: 50)

#### `get_backtest_report`

Get markdown report for a completed backtest.

**Parameters:**

- `runId` (string): Run ID

### Data Operations

#### `list_datasets`

List available datasets.

**Parameters:**

- `symbol` (string, optional): Filter by symbol
- `source` (string, optional): Filter by source (csv, tiingo, polygon)

#### `list_csv_files`

List CSV files in datasets directory.

#### `get_data_sources`

Get information about available data sources.

**Note:** Use `source: "auto"` in backtest requests to automatically try data sources in this order:

1. CSV (local files)
2. Tiingo (if API key configured)
3. Polygon (if Tiingo fails and API key configured)

#### `get_timeframes`

Get supported timeframes.

#### `check_data_availability`

Check whether data exists for a symbol/timeframe/date range before submitting a backtest. \
Returns `available` (true/false), the number of rows found (if any), suggested alternatives, and notes when intraday data requires TIINGO_API_KEY or POLYGON_API_KEY.

**Parameters:**

- `symbol` (string): Instrument ticker (e.g., "MSFT")
- `timeframe` (enum): One of `1d`, `1h`, `15m`, `1m`
- `start` (string, optional): Inclusive start date (ISO)
- `end` (string, optional): Inclusive end date (ISO)

### Strategy Operations

#### `list_strategies`

List all available strategies with descriptions and parameters.

#### `get_strategy_details`

Get detailed info about a specific strategy.

**Parameters:**

- `name` (string): Strategy name (e.g., 'sma_crossover', 'mean_reversion')

#### `list_custom_strategies`

List custom user-defined strategies.

Each entry now includes `description`, `version`, `tags`, and a `parameters` array describing the required options (name, type, default, min/max, description) so you can configure custom strategies without guessing.

#### `get_custom_strategy_source`

Get source code of a custom strategy.

**Parameters:**

- `filename` (string): Strategy filename (e.g., 'my-strategy.ts')

### Metrics & Analysis

#### `get_available_metrics`

List all available performance metrics.

#### `compare_backtests`

Compare metrics from multiple backtests.

**Parameters:**

- `runIds` (array): Array of run IDs to compare

#### `get_statistical_tests`

Get statistical test results for a backtest.

**Parameters:**

- `runId` (string): Run ID

### Optimization

#### `submit_optimization`

Submit grid search optimization job.

**Parameters:**

- `request` (object): OptimizationRequest with paramGrid, objective, etc.

**Example:**

```json
{
  "request": {
    "name": "SMA Optimization",
    "baseRequest": {
      "runName": "SMA Opt",
      "data": [...],
      "costs": { "feeBps": 5, "slippageBps": 2 },
      "initialCash": 100000
    },
    "strategy": {
      "name": "sma_crossover"
    },
    "paramGrid": {
      "fastPeriod": [5, 10, 15, 20],
      "slowPeriod": [20, 30, 40, 50]
    },
    "objective": "sharpe",
    "constraints": {
      "minTrades": 10,
      "maxDrawdown": -0.20
    }
  }
}
```

#### `get_optimization_status`

Get optimization job status and progress.

**Parameters:**

- `optId` (string): Optimization ID

#### `get_optimization_results`

Get full optimization results.

**Parameters:**

- `optId` (string): Optimization ID

#### `list_optimizations`

List all optimization jobs.

**Parameters:**

- `status` (string, optional): Filter by status
- `limit` (number, optional): Max results (default: 50)

### Testing & Build

#### `run_tests`

Run test suite.

**Parameters:**

- `filter` (string, optional): Package filter (e.g., '@crucible-trader/data')
- `timeout` (number, optional): Timeout in seconds (default: 300)

#### `run_lint`

Run ESLint.

#### `build_all`

Build all packages.

**Parameters:**

- `filter` (string, optional): Package filter

#### `install_dependencies`

Install/update dependencies.

## Architecture

```
services/mcp-server/
├── src/
│   ├── index.ts           # Main server entry point
│   ├── db.ts              # Database utilities
│   └── tools/
│       ├── backtest.ts    # Backtest operations
│       ├── data.ts        # Data queries
│       ├── strategy.ts    # Strategy management
│       ├── metrics.ts     # Metrics & analysis
│       ├── optimization.ts # Optimization jobs
│       └── test.ts        # Testing & build
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
# Build
pnpm build

# Run in dev mode
pnpm dev

# Clean build artifacts
pnpm clean
```

## Database

The MCP server uses the same SQLite database as the API service (`storage/db/api.sqlite`). It reads and writes:

- **runs**: Backtest runs
- **artifacts**: Generated artifacts (Parquet, reports)
- **datasets**: Cached datasets
- **optimizations**: Optimization jobs
- **stat_tests**: Statistical test results

## Security

- All tool inputs are validated using Zod schemas
- File paths are validated to prevent directory traversal
- API keys are read from environment variables
- No user authentication (relies on MCP client security)

## Logging

All operations are logged using a custom MCP-compatible logger that writes to **stderr** (not stdout):

```typescript
{
  "ts": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "module": "@crucible-trader/mcp-server/tools/backtest",
  "msg": "Executing backtest: run-123",
  "runName": "My Test"
}
```

**Important:** The MCP server uses a custom logger (`createMcpLogger`) that writes ALL logs to stderr instead of stdout. This is necessary because MCP uses stdout for JSON-RPC protocol messages. Writing logs to stdout would corrupt the protocol communication.

## Error Handling

All tool errors return structured JSON responses:

```json
{
  "error": "Error description",
  "message": "Detailed error message"
}
```

## Future Enhancements

- Real-time progress updates for long-running operations
- Streaming backtest results
- WebSocket support for live data
- Resource providers for accessing artifacts
- Prompt templates for common operations
