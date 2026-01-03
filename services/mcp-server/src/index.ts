#!/usr/bin/env node

/**
 * Crucible Trader MCP Server
 *
 * Exposes backtesting, optimization, and analysis capabilities via MCP protocol.
 * Allows AI assistants to programmatically interact with the Crucible Trader framework.
 */

import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(MODULE_DIR, "..", "..", "..");
loadEnv({ path: join(REPO_ROOT, ".env") });
loadEnv();

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
import { openDatabase, type SqliteInstance } from "./db.js";
import { registerBacktestTools } from "./tools/backtest.js";
import { registerDataTools } from "./tools/data.js";
import { registerStrategyTools } from "./tools/strategy.js";
import { registerMetricsTools } from "./tools/metrics.js";
import { registerOptimizationTools } from "./tools/optimization.js";
import { registerTestTools } from "./tools/test.js";

const SERVER_NAME = "crucible-trader";
const SERVER_VERSION = "0.0.1";

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
      name: SERVER_NAME,
      version: SERVER_VERSION,
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

async function streamBacktestProgress(
  req: IncomingMessage,
  res: ServerResponse,
  db: SqliteInstance,
): Promise<void> {
  if (req.method !== "GET") {
    res.writeHead(405, {
      Allow: "GET",
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method Not Allowed: Use GET for SSE streams",
        },
        id: null,
      }),
    );
    return;
  }
  const acceptHeader = req.headers.accept?.toLowerCase() ?? "";
  if (!acceptHeader.includes("text/event-stream")) {
    res.writeHead(406, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Not Acceptable: Client must accept text/event-stream",
        },
        id: null,
      }),
    );
    return;
  }

  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const runId = url.searchParams.get("runId");
  if (!runId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32602,
          message: "runId query parameter is required",
        },
        id: null,
      }),
    );
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const sendEvent = (eventName: string, payload: Record<string, unknown>) => {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  let closed = false;
  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (streamInterval) {
      clearInterval(streamInterval);
      streamInterval = null;
    }
    res.end();
  };

  const pushUpdate = async () => {
    if (closed) {
      return;
    }
    try {
      const row = await db.get<{
        status: string;
        summary_json: string | null;
        execution_time_ms: number | null;
        error_message: string | null;
      }>(
        "SELECT status, summary_json, execution_time_ms, error_message FROM runs WHERE run_id = ?",
        [runId],
      );

      if (!row) {
        sendEvent("progress", { runId, status: "not_found" });
        return;
      }

      const summary = row.summary_json ? JSON.parse(row.summary_json) : undefined;
      const payload = {
        runId,
        status: row.status,
        summary,
        executionTimeMs: row.execution_time_ms ?? null,
        error: row.error_message ?? null,
      };

      const eventName =
        row.status === "completed" || row.status === "failed" ? "complete" : "progress";
      sendEvent(eventName, payload);

      if (eventName === "complete") {
        cleanup();
      }
    } catch (error) {
      sendEvent("error", {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  let streamInterval: ReturnType<typeof setInterval> | null = null;
  req.on("close", cleanup);
  await pushUpdate();
  streamInterval = setInterval(() => {
    void pushUpdate();
  }, 1500);
}

async function startHttpServer(db: SqliteInstance): Promise<void> {
  const port = Number(process.env.MCP_PORT ?? "3012");
  const host = process.env.MCP_HOST ?? "127.0.0.1";

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.startsWith("/mcp/progress")) {
      await streamBacktestProgress(req, res, db);
      return;
    }
    if (req.url === "/mcp" && req.method === "GET") {
      const info = {
        status: "ok",
        server: SERVER_NAME,
        version: SERVER_VERSION,
        transport: "http",
        host,
        port,
        supportedTransports: ["stdio", "http"],
        timestamp: new Date().toISOString(),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(info));
      return;
    }

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
    await startHttpServer(db);
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
