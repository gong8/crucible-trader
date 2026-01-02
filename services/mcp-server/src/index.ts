#!/usr/bin/env node

/**
 * Crucible Trader MCP Server
 *
 * Exposes backtesting, optimization, and analysis capabilities via MCP protocol.
 * Allows AI assistants to programmatically interact with the Crucible Trader framework.
 */

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
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
  logger.info("Registered tool", { name });
}

const sessionTransports = new Map<string, StreamableHTTPServerTransport>();
const sessionServers = new Map<string, Server>();

function createMcpServer(): Server {
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

    logger.info("Executing tool", { name });

    try {
      const result = await handler(args ?? {});
      logger.info("Tool executed successfully", { name });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Tool execution failed", { name, error: errorMessage });
      throw error;
    }
  });

  return server;
}

async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : undefined);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function startHttpServer(): Promise<void> {
  const port = Number(process.env.MCP_PORT ?? "3012");
  const host = process.env.MCP_HOST ?? "127.0.0.1";

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "crucible-trader-mcp" }));
      return;
    }

    if (req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST", "Content-Type": "text/plain" });
      res.end("Method Not Allowed");
      return;
    }

    let body: unknown;
    try {
      body = await parseRequestBody(req);
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null,
        }),
      );
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      if (sessionId && sessionTransports.has(sessionId)) {
        const transport = sessionTransports.get(sessionId)!;
        await transport.handleRequest(req, res, body);
        return;
      }

      if (!sessionId && isInitializeRequest(body)) {
        const newSessionId = randomUUID();
        const server = createMcpServer();

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          enableJsonResponse: true,
          onsessioninitialized: (initializedSessionId: string) => {
            sessionTransports.set(initializedSessionId, transport);
            sessionServers.set(initializedSessionId, server);
          },
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: invalid or missing session" },
          id: null,
        }),
      );
    } catch (error) {
      logger.error("Error handling MCP request", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
    }
  });

  httpServer.listen(port, host, () => {
    logger.info("MCP HTTP server listening", { host, port });
    logger.info("MCP endpoint", { url: `http://localhost:${port}/mcp` });
  });
}

/**
 * Main server initialization.
 */
async function main(): Promise<void> {
  logger.info("Starting Crucible Trader MCP Server");

  // Initialize database
  const db = await openDatabase();
  logger.info("Database initialized");

  // Register all tools
  await registerBacktestTools(db, registerTool);
  await registerDataTools(db, registerTool);
  await registerStrategyTools(db, registerTool);
  await registerMetricsTools(db, registerTool);
  await registerOptimizationTools(db, registerTool);
  await registerTestTools(db, registerTool);

  logger.info("Registered tools", { count: toolRegistry.size });

  const transportMode = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();

  if (transportMode === "http") {
    await startHttpServer();
    return;
  }

  if (transportMode !== "stdio") {
    logger.warn("Unknown MCP_TRANSPORT value, defaulting to stdio", { transportMode });
  }

  const server = createMcpServer();
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
