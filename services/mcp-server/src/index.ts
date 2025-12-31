#!/usr/bin/env node

/**
 * Crucible Trader MCP Server
 *
 * Exposes backtesting, optimization, and analysis capabilities via MCP protocol.
 * Allows AI assistants to programmatically interact with the Crucible Trader framework.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { createMcpLogger } from "./logger.js";
import { openDatabase } from "./db.js";
import { registerBacktestTools } from "./tools/backtest.js";
import { registerDataTools } from "./tools/data.js";
import { registerStrategyTools } from "./tools/strategy.js";
import { registerMetricsTools } from "./tools/metrics.js";
import { registerOptimizationTools } from "./tools/optimization.js";
import { registerTestTools } from "./tools/test.js";

const logger = createMcpLogger("@crucible-trader/mcp-server");

/**
 * Redirect console.log to stderr to prevent corruption of MCP protocol.
 * MCP uses stdout for JSON-RPC messages, so ANY stdout output breaks it.
 */
console.log = (...args: unknown[]) => {
  process.stderr.write(`[console.log] ${args.join(" ")}\n`);
};

console.info = (...args: unknown[]) => {
  process.stderr.write(`[console.info] ${args.join(" ")}\n`);
};

console.warn = (...args: unknown[]) => {
  process.stderr.write(`[console.warn] ${args.join(" ")}\n`);
};

// console.error already goes to stderr, so we leave it alone

/**
 * Tool registry mapping tool names to handler functions.
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

/**
 * Helper to create a text content response.
 */
export function textContent(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}
const toolRegistry = new Map<string, ToolHandler>();

/**
 * Tool metadata for ListTools response.
 */
interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}
const toolMetadata: ToolMetadata[] = [];

/**
 * Register a tool with the MCP server.
 */
export function registerTool(
  name: string,
  description: string,
  inputSchema: ToolMetadata["inputSchema"],
  handler: ToolHandler,
): void {
  toolRegistry.set(name, handler);
  toolMetadata.push({ name, description, inputSchema });
  logger.info(`Registered tool: ${name}`);
}

/**
 * Main server initialization.
 */
async function main(): Promise<void> {
  logger.info("Starting Crucible Trader MCP Server");

  // Initialize database
  const db = await openDatabase();
  logger.info("Database initialized");

  // Create MCP server
  const server = new Server(
    {
      name: "crucible-trader",
      version: "0.0.1",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register all tools
  await registerBacktestTools(db, registerTool);
  await registerDataTools(db, registerTool);
  await registerStrategyTools(db, registerTool);
  await registerMetricsTools(db, registerTool);
  await registerOptimizationTools(db, registerTool);
  await registerTestTools(db, registerTool);

  logger.info(`Registered ${toolRegistry.size} tools`);

  // Handle ListTools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolMetadata };
  });

  // Handle CallTool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = toolRegistry.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    logger.info(`Executing tool: ${name}`, { args });

    try {
      const result = await handler(args ?? {});
      logger.info(`Tool executed successfully: ${name}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool execution failed: ${name}`, { error: errorMessage });
      throw error;
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("MCP Server running on stdio");
}

// Handle shutdown gracefully
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down");
  process.exit(0);
});

// Start the server
main().catch((error) => {
  logger.error("Fatal error", { error });
  process.exit(1);
});
