# Setting Up Crucible Trader MCP Server

This guide will help you set up the Crucible Trader MCP Server for use with Claude Desktop or other MCP clients.

## Prerequisites

1. Node.js 20+ installed
2. pnpm package manager
3. Crucible Trader repository cloned locally

## Installation Steps

### 1. Build the MCP Server

From the repository root:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -w build

# Or build just the MCP server
pnpm --filter @crucible-trader/mcp-server build
```

### 2. Configure Claude Desktop

#### macOS

1. Locate your Claude Desktop config file:

   ```bash
   ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. If the file doesn't exist, create it with this content:

   ```json
   {
     "mcpServers": {}
   }
   ```

3. Add the Crucible Trader MCP server configuration:

   ```json
   {
     "mcpServers": {
       "crucible-trader": {
         "command": "node",
         "args": ["/absolute/path/to/crucible-trader/services/mcp-server/dist/index.js"],
         "env": {
           "TIINGO_API_KEY": "your-tiingo-api-key",
           "POLYGON_API_KEY": "your-polygon-api-key"
         }
       }
     }
   }
   ```

   **Important:** Replace `/absolute/path/to/crucible-trader` with the actual absolute path to your repository.

#### Windows

1. Config file location:

   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

2. Same JSON structure as macOS, but use Windows-style paths:
   ```json
   {
     "mcpServers": {
       "crucible-trader": {
         "command": "node",
         "args": [
           "C:\\Users\\YourName\\Projects\\crucible-trader\\services\\mcp-server\\dist\\index.js"
         ],
         "env": {
           "TIINGO_API_KEY": "your-tiingo-api-key",
           "POLYGON_API_KEY": "your-polygon-api-key"
         }
       }
     }
   }
   ```

#### Linux

1. Config file location:

   ```
   ~/.config/Claude/claude_desktop_config.json
   ```

2. Same JSON structure as macOS.

### 3. API Keys (Optional)

The MCP server works without API keys for CSV data sources, but to use Tiingo or Polygon data sources, you'll need:

- **Tiingo API Key**: Get one at https://api.tiingo.com/
- **Polygon API Key**: Get one at https://polygon.io/

Add these keys to the `env` section in your config as shown above.

### 4. Restart Claude Desktop

After updating the config file, completely quit and restart Claude Desktop for the changes to take effect.

## Verification

### Check MCP Server Connection

1. Open Claude Desktop
2. Start a new conversation
3. Look for the MCP tools icon (wrench/hammer icon) in the interface
4. You should see tools from "crucible-trader" available

### Test Basic Functionality

Try asking Claude to:

```
List all available strategies in Crucible Trader
```

Claude should use the `list_strategies` tool and return information about available trading strategies.

## Troubleshooting

### MCP Server Not Appearing

1. **Check the config file path**: Ensure it's in the correct location for your OS
2. **Validate JSON**: Use a JSON validator to ensure your config is valid JSON
3. **Check absolute paths**: The path to `index.js` must be absolute, not relative
4. **Restart Claude**: Make sure you fully quit and restarted Claude Desktop

### Tools Not Working

1. **Check build**: Ensure the MCP server was built successfully:

   ```bash
   ls -la services/mcp-server/dist/index.js
   ```

2. **Check Node version**: Ensure you're running Node 20+:

   ```bash
   node --version
   ```

3. **Check logs**: Claude Desktop may have logs you can inspect (location varies by OS)

### Data Source Issues

1. **CSV files**: Ensure CSV files are in `storage/datasets/`
2. **API keys**: Verify your API keys are correct in the config
3. **Network**: Ensure you have internet connectivity for external data sources

## Next Steps

Once set up, you can:

- Submit backtests programmatically through Claude
- Query historical results and metrics
- Run parameter optimizations
- Compare strategy performance
- Run tests and builds

See the main [README.md](./README.md) for full documentation of available tools.

## Advanced Configuration

### Using with Other MCP Clients

The Crucible Trader MCP server follows the standard MCP protocol and can be used with any MCP-compatible client. Configure it according to your client's documentation, using:

- **Command**: `node`
- **Args**: Path to `dist/index.js`
- **Transport**: stdio (default)

### Multiple Environments

You can configure multiple instances for different environments:

```json
{
  "mcpServers": {
    "crucible-trader-dev": {
      "command": "node",
      "args": ["/path/to/dev/crucible-trader/services/mcp-server/dist/index.js"]
    },
    "crucible-trader-prod": {
      "command": "node",
      "args": ["/path/to/prod/crucible-trader/services/mcp-server/dist/index.js"]
    }
  }
}
```

## Support

For issues or questions:

1. Check the main project documentation
2. Review the test suite for usage examples
3. Open an issue on GitHub
