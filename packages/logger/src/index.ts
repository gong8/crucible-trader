export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMeta = {
  readonly runId?: string;
} & Record<string, unknown>;

export interface Logger {
  readonly module: string;
  log(level: LogLevel, msg: string, meta?: LogMeta): void;
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
}

const writeLine = (level: LogLevel, line: string): void => {
  const output = level === "error" ? process.stderr : process.stdout;
  output.write(`${line}\n`);
};

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

export const createLogger = (moduleName: string): Logger => {
  const log = (level: LogLevel, msg: string, meta?: LogMeta): void => {
    const entry = buildEntry(moduleName, level, msg, meta);
    writeLine(level, JSON.stringify(entry));
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
