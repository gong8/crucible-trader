/**
 * Custom logger for MCP server that writes ALL logs to stderr.
 * This is necessary because MCP uses stdout for JSON-RPC communication.
 */

import type { LogLevel, LogMeta } from "@crucible-trader/logger";

export interface Logger {
  readonly module: string;
  log(level: LogLevel, msg: string, meta?: LogMeta): void;
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
}

/**
 * Write log entry to stderr (NOT stdout, as MCP uses stdout for protocol messages).
 */
const writeLine = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

/**
 * Build a structured log entry.
 */
const buildEntry = (moduleName: string, level: LogLevel, msg: string, meta?: LogMeta) => {
  const { runId, ...rest } = meta ?? {};

  return {
    ts: new Date().toISOString(),
    level,
    module: moduleName,
    msg,
    ...(typeof runId === "string" ? { runId } : {}),
    ...rest,
  };
};

/**
 * Create a logger instance for MCP server.
 * All logs are written to stderr to avoid interfering with MCP protocol on stdout.
 */
export const createMcpLogger = (moduleName: string): Logger => {
  const log = (level: LogLevel, msg: string, meta?: LogMeta): void => {
    const entry = buildEntry(moduleName, level, msg, meta);
    writeLine(JSON.stringify(entry));
  };

  return {
    module: moduleName,
    log,
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
  };
};
