# Data Source Configuration

## Overview

The MCP server supports multiple data sources for backtesting. Use `source: "auto"` for automatic fallback logic.

## Data Source Options

### 1. `"auto"` (Recommended)

Automatically tries data sources in order until data is found:

1. **CSV** - Checks local `storage/datasets/` directory
2. **Tiingo** - Tries Tiingo API (requires API key)
3. **Polygon** - Falls back to Polygon.io API (requires API key)

**Example:**

```json
{
  "data": [
    {
      "source": "auto",
      "symbol": "GOOG",
      "timeframe": "1h",
      "start": "2024-01-01",
      "end": "2024-12-01",
      "adjusted": true
    }
  ]
}
```

**Behavior:**

- ✅ Fast: Uses CSV if available
- ✅ Reliable: Automatically falls back to APIs if CSV missing
- ✅ Flexible: Works with or without API keys
- ⚠️ Note: Free Tiingo tier only has daily data; hourly data requires paid subscription

### 2. `"csv"`

Forces use of local CSV files only.

**Example:**

```json
{
  "data": [
    {
      "source": "csv",
      "symbol": "AAPL",
      "timeframe": "1d"
    }
  ]
}
```

**When to use:**

- You have local CSV files
- You want to avoid API rate limits
- Testing with custom data

**Note:** CSV files should be in `storage/datasets/` with format: `{symbol}_{timeframe}.csv`

### 3. `"tiingo"`

Forces use of Tiingo API only.

**Example:**

```json
{
  "data": [
    {
      "source": "tiingo",
      "symbol": "MSFT",
      "timeframe": "1d",
      "start": "2024-01-01",
      "end": "2024-12-01",
      "adjusted": true
    }
  ]
}
```

**When to use:**

- You specifically want Tiingo data
- You have a paid Tiingo subscription with intraday access
- You're testing Tiingo integration

**Requirements:**

- `TIINGO_API_KEY` environment variable configured
- Paid subscription for intraday data (1h, 15m, 1m)

### 4. `"polygon"`

Forces use of Polygon.io API only.

**Example:**

```json
{
  "data": [
    {
      "source": "polygon",
      "symbol": "TSLA",
      "timeframe": "1h",
      "start": "2024-01-01",
      "end": "2024-12-01",
      "adjusted": true
    }
  ]
}
```

**When to use:**

- You specifically want Polygon data
- Tiingo doesn't have the data you need
- You're testing Polygon integration

**Requirements:**

- `POLYGON_API_KEY` environment variable configured

## Timeframe Support

| Timeframe   | CSV | Tiingo (Free) | Tiingo (Paid) | Polygon (Free) | Polygon (Paid) |
| ----------- | --- | ------------- | ------------- | -------------- | -------------- |
| 1d (Daily)  | ✅  | ✅            | ✅            | ✅             | ✅             |
| 1h (Hourly) | ✅  | ❌            | ✅            | ⚠️ Limited     | ✅             |
| 15m         | ✅  | ❌            | ✅            | ⚠️ Limited     | ✅             |
| 1m (Minute) | ✅  | ❌            | ✅            | ⚠️ Limited     | ✅             |

## Configuration

Add API keys to your Claude Desktop config:

```json
{
  "mcpServers": {
    "crucible-trader": {
      "command": "node",
      "args": ["/path/to/services/mcp-server/dist/index.js"],
      "env": {
        "TIINGO_API_KEY": "your-tiingo-key",
        "POLYGON_API_KEY": "your-polygon-key"
      }
    }
  }
}
```

## Best Practices

### For Daily Backtests

Use `source: "auto"` - it will use CSV if available, or fetch from Tiingo/Polygon.

```json
{
  "source": "auto",
  "symbol": "AAPL",
  "timeframe": "1d",
  "start": "2023-01-01",
  "end": "2024-12-31"
}
```

### For Intraday Backtests

- **With API keys:** Use `source: "auto"`
- **Without API keys:** Use `source: "csv"` and ensure you have the CSV file

```json
{
  "source": "auto",
  "symbol": "GOOG",
  "timeframe": "1h",
  "start": "2024-06-01",
  "end": "2024-11-30"
}
```

### For Testing

Use `source: "csv"` to avoid hitting API rate limits:

```json
{
  "source": "csv",
  "symbol": "AAPL",
  "timeframe": "1h"
}
```

## Troubleshooting

### "No bars loaded" Error

**Possible causes:**

1. CSV file doesn't exist
2. API keys not configured
3. Free tier limitation (intraday data)
4. Invalid date range (market closed days)

**Solutions:**

1. Check CSV file exists: `ls storage/datasets/{symbol}_{timeframe}.csv`
2. Verify API keys in Claude Desktop config
3. Use daily timeframe or upgrade to paid tier
4. Use market-open date ranges

### Empty Dataset

If `source: "auto"` returns empty data:

1. Check if CSV file has data
2. Verify API keys are correct
3. Check API service status (Tiingo/Polygon)
4. Ensure date range includes market open days

## Examples

### Example 1: Simple Auto-Fallback

```json
{
  "runName": "AAPL Strategy Test",
  "data": [
    {
      "source": "auto",
      "symbol": "AAPL",
      "timeframe": "1d",
      "start": "2024-01-01",
      "end": "2024-12-01"
    }
  ],
  "strategy": { "name": "sma_crossover", "params": {} },
  "costs": { "feeBps": 10, "slippageBps": 5 },
  "initialCash": 100000
}
```

### Example 2: Hourly with Fallback

```json
{
  "runName": "GOOG Scalper",
  "data": [
    {
      "source": "auto",
      "symbol": "GOOG",
      "timeframe": "1h",
      "start": "2024-06-01",
      "end": "2024-11-30",
      "adjusted": true
    }
  ],
  "strategy": { "name": "dip-rebound-scalper", "params": {} },
  "costs": { "feeBps": 10, "slippageBps": 5 },
  "initialCash": 100000
}
```

### Example 3: Multi-Symbol with Auto

```json
{
  "runName": "Portfolio Backtest",
  "data": [
    {
      "source": "auto",
      "symbol": "AAPL",
      "timeframe": "1d",
      "start": "2024-01-01",
      "end": "2024-12-01"
    },
    {
      "source": "auto",
      "symbol": "MSFT",
      "timeframe": "1d",
      "start": "2024-01-01",
      "end": "2024-12-01"
    },
    {
      "source": "auto",
      "symbol": "GOOG",
      "timeframe": "1d",
      "start": "2024-01-01",
      "end": "2024-12-01"
    }
  ],
  "strategy": { "name": "momentum", "params": {} },
  "costs": { "feeBps": 10, "slippageBps": 5 },
  "initialCash": 100000
}
```

## Summary

- **Use `"auto"`** for most cases - it's smart and handles fallbacks
- **Use `"csv"`** when you want to force local files only
- **Use `"tiingo"` or `"polygon"`** when you need a specific data provider
- **Configure API keys** in Claude Desktop config for best results
- **Remember:** Free Tiingo tier = daily data only; intraday needs paid subscription
