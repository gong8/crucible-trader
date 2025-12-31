# Crucible Trader MCP Server Examples

This document provides practical examples of using the Crucible Trader MCP server through Claude.

## Basic Workflow

### 1. Listing Available Strategies

```
User: List all available trading strategies

Claude: I'll use the list_strategies tool to show you all available strategies.
[Calls list_strategies tool]

Response:
- SMA Crossover: Trend-following crossover with fast/slow moving averages
  - Parameters: fastLength (5), slowLength (15)
- Momentum: Basic momentum strategy with threshold
  - Parameters: lookback (10), threshold (0.01)
- Mean Reversion: Buys oversold conditions and sells overbought extremes
  - Parameters: lookback (20), zScore (2)
- Breakout: Channel breakout system
  - Parameters: lookback (20), threshold (0.02)
- Chaos Trader: Random chaos trader for benchmarking
  - Parameters: chaos (0.5), seed (42)
```

### 2. Submitting a Backtest

```
User: Run a backtest of the SMA Crossover strategy on AAPL from 2023-01-01 to 2023-12-31 using daily data

Claude: I'll submit a backtest with those parameters using automatic data source selection.
[Calls submit_backtest tool with source: "auto" to try CSV → Tiingo → Polygon]

Response:
{
  "runId": "run-1704123456789-abc123",
  "status": "queued",
  "message": "Backtest submitted successfully"
}

Your backtest has been queued with run ID: run-1704123456789-abc123
You can check its status in a moment.
```

### 3. Checking Backtest Status

```
User: Check the status of that backtest

Claude: [Calls get_backtest_status with the run ID]

Response:
{
  "runId": "run-1704123456789-abc123",
  "status": "completed",
  "executionTimeMs": 1250
}

The backtest completed successfully in 1.25 seconds!
```

### 4. Getting Results

```
User: Show me the results

Claude: [Calls get_backtest_results]

Response:
{
  "runId": "run-1704123456789-abc123",
  "summary": {
    "sharpe": 1.45,
    "sortino": 2.10,
    "max_dd": -0.15,
    "cagr": 0.22,
    "winrate": 0.58,
    "total_return": 0.22,
    "num_trades": 24,
    "profit_factor": 1.85
  },
  "artifacts": {
    "equityParquet": "storage/runs/run-1704123456789-abc123/equity.parquet",
    "tradesParquet": "storage/runs/run-1704123456789-abc123/trades.parquet",
    "barsParquet": "storage/runs/run-1704123456789-abc123/bars.parquet",
    "reportMd": "storage/runs/run-1704123456789-abc123/report.md"
  },
  "executionTimeMs": 1250
}

Great results! Here's a summary:
- Sharpe Ratio: 1.45 (good risk-adjusted returns)
- Max Drawdown: -15% (moderate risk)
- CAGR: 22% (strong annual growth)
- Win Rate: 58% (profitable more often than not)
- 24 trades executed
```

### 5. Getting the Full Report

```
User: Show me the full markdown report

Claude: [Calls get_backtest_report]

[Returns the full markdown report with detailed metrics, trade analysis, and charts]
```

## Advanced Examples

### Parameter Optimization

```
User: Optimize the SMA Crossover strategy parameters to maximize Sharpe ratio

Claude: I'll run a grid search optimization for you.
[Calls submit_optimization tool]

{
  "optId": "opt-abc123-def456",
  "status": "queued",
  "totalCombinations": 16,
  "message": "Optimization job submitted successfully"
}

I've submitted an optimization job testing 16 different parameter combinations.
The job ID is opt-abc123-def456.
```

### Comparing Multiple Backtests

```
User: Compare the last 3 SMA Crossover backtests I ran

Claude: First, let me list your recent backtests.
[Calls list_backtests with filter]

I found these SMA Crossover runs:
- run-1704123456789-abc123 (Sharpe: 1.45)
- run-1704123456789-def456 (Sharpe: 1.32)
- run-1704123456789-ghi789 (Sharpe: 1.58)

Now let me compare them in detail.
[Calls compare_backtests]

Best performer: run-1704123456789-ghi789
- Highest Sharpe: 1.58
- Lowest drawdown: -12%
- Best CAGR: 24%
```

### Data Exploration

```
User: What CSV datasets do I have available?

Claude: [Calls list_csv_files]

You have the following CSV files:
- AAPL_daily.csv
- MSFT_daily.csv
- SPY_daily.csv
- QQQ_daily.csv
```

### Running Tests

```
User: Run the test suite for the data package

Claude: [Calls run_tests with filter "@crucible-trader/data"]

{
  "success": true,
  "exitCode": 0,
  "executionTimeMs": 3456,
  "filter": "@crucible-trader/data"
}

All tests passed! ✓
- 62 tests completed in 3.5 seconds
```

## Complex Workflows

### End-to-End Strategy Evaluation

```
User: I want to evaluate the Mean Reversion strategy.
Run a backtest on AAPL for 2023, then optimize the parameters,
and finally compare it to a Buy & Hold strategy.

Claude: I'll break this down into steps:

Step 1: Run initial backtest with default parameters
[Calls submit_backtest for Mean Reversion]
✓ Run ID: run-abc123

Step 2: Submit optimization job
[Calls submit_optimization with parameter grid]
✓ Optimization ID: opt-def456

Step 3: Run Buy & Hold baseline
[Calls submit_backtest for Buy & Hold]
✓ Run ID: run-ghi789

Now monitoring the optimization...
[Polls get_optimization_status]

Optimization complete! Best parameters:
- lookback: 15
- zScore: 1.8

Step 4: Run backtest with optimized parameters
[Calls submit_backtest with best params]
✓ Run ID: run-jkl012

Step 5: Compare all results
[Calls compare_backtests]

Results:
1. Optimized Mean Reversion: Sharpe 1.82, CAGR 28%
2. Default Mean Reversion: Sharpe 1.45, CAGR 22%
3. Buy & Hold: Sharpe 1.12, CAGR 18%

The optimized Mean Reversion strategy outperformed both the default
parameters and the Buy & Hold baseline!
```

### Portfolio Analysis

```
User: Create a portfolio backtest with 60% SPY and 40% QQQ,
rebalanced monthly, from 2022 to 2024

Claude: I'll set up a multi-asset backtest for you.
[Constructs appropriate BacktestRequest with multiple data sources]

Portfolio configuration:
- 60% SPY (S&P 500)
- 40% QQQ (Nasdaq 100)
- Monthly rebalancing
- Period: 2022-2024

[Calls submit_backtest]
Run ID: run-portfolio-123

[Monitors and retrieves results]
```

## Integration Examples

### Continuous Testing

```
User: Run all tests, then build all packages, and let me know if everything passes

Claude: I'll run the full test and build pipeline.

Step 1: Running tests
[Calls run_tests]
✓ All tests passed (290 tests, 45 seconds)

Step 2: Running lint
[Calls run_lint]
✓ No linting errors

Step 3: Building packages
[Calls build_all]
✓ All packages built successfully (12 seconds)

Everything passes! Your codebase is healthy.
```

### Strategy Development Workflow

```
User: I created a new custom strategy file called rsi-reversion.ts.
Can you verify it exists and tell me how to test it?

Claude: Let me check for your custom strategy.
[Calls list_custom_strategies]

✓ Found: rsi-reversion.ts

Now let me examine the source code.
[Calls get_custom_strategy_source]

Your strategy looks good! Here's how to test it:

1. Reload custom strategies:
   [Can call /api/strategies/reload if needed]

2. Run a backtest:
   [Provides example submit_backtest call with the custom strategy]

3. Compare against similar strategies:
   [Suggests comparison with Mean Reversion]
```

## Tips for Using the MCP Server

1. **Start Simple**: Begin with listing strategies and datasets before running backtests
2. **Check Status**: Always check backtest status before retrieving results
3. **Use Filters**: When listing backtests, use status filters to find relevant runs
4. **Compare Results**: Use compare_backtests to evaluate multiple strategies
5. **Iterate**: Use optimization results to inform manual parameter tweaking
6. **Build & Test**: Run tests after making code changes to ensure stability

## Error Handling

The MCP server returns structured errors:

```json
{
  "error": "Strategy not found",
  "availableStrategies": ["sma_crossover", "momentum", ...]
}
```

Claude will interpret these and suggest corrections.
