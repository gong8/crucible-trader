import { strict as assert } from "node:assert";
import test from "node:test";
import { createLogger } from "../src/index.js";

test("createLogger returns a logger with the correct module name", () => {
  const logger = createLogger("test-module");
  assert.equal(logger.module, "test-module");
});

test("logger.log writes JSON formatted output to stdout", (t) => {
  const logger = createLogger("test-log");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger.log("info", "test message", { runId: "123", extra: "data" });

  assert.equal(logs.length, 1);
  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.module, "test-log");
  assert.equal(parsed.msg, "test message");
  assert.equal(parsed.runId, "123");
  assert.equal(parsed.extra, "data");
  assert.ok(parsed.ts);
  assert.ok(new Date(parsed.ts).getTime() > 0);
});

test("logger.debug calls log with debug level", (t) => {
  const logger = createLogger("debug-test");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger.debug("debug message");

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.equal(parsed.level, "debug");
  assert.equal(parsed.msg, "debug message");
});

test("logger.info calls log with info level", (t) => {
  const logger = createLogger("info-test");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger.info("info message");

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.msg, "info message");
});

test("logger.warn calls log with warn level", (t) => {
  const logger = createLogger("warn-test");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger.warn("warning message");

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.equal(parsed.level, "warn");
  assert.equal(parsed.msg, "warning message");
});

test("logger.error writes to stderr and uses error level", (t) => {
  const logger = createLogger("error-test");
  const logs: string[] = [];

  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stderr.write = originalWrite;
  });

  logger.error("error message");

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.equal(parsed.level, "error");
  assert.equal(parsed.msg, "error message");
});

test("logger includes runId in output when provided", (t) => {
  const logger = createLogger("runid-test");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger.info("message with runId", { runId: "test-run-456" });

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.equal(parsed.runId, "test-run-456");
});

test("logger excludes runId when not a string", (t) => {
  const logger = createLogger("runid-exclude-test");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger.info("message", { runId: 123 as unknown as string });

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.equal(parsed.runId, undefined);
});

test("logger handles empty metadata", (t) => {
  const logger = createLogger("empty-meta-test");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger.info("message without meta");

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.equal(parsed.msg, "message without meta");
  assert.ok(parsed.ts);
  assert.equal(Object.keys(parsed).includes("runId"), false);
});

test("logger handles complex metadata", (t) => {
  const logger = createLogger("complex-meta-test");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger.info("complex", {
    runId: "test",
    nested: { key: "value" },
    array: [1, 2, 3],
    boolean: true,
    number: 42,
  });

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.deepEqual(parsed.nested, { key: "value" });
  assert.deepEqual(parsed.array, [1, 2, 3]);
  assert.equal(parsed.boolean, true);
  assert.equal(parsed.number, 42);
});

test("logger timestamp is in ISO format", (t) => {
  const logger = createLogger("timestamp-test");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  const before = new Date().toISOString();
  logger.info("timestamp check");
  const after = new Date().toISOString();

  const parsed = JSON.parse(logs[0] ?? "{}");
  assert.ok(parsed.ts >= before);
  assert.ok(parsed.ts <= after);
});

test("multiple loggers with different modules don't interfere", (t) => {
  const logger1 = createLogger("module-1");
  const logger2 = createLogger("module-2");
  const logs: string[] = [];

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    logs.push(chunk.toString());
    return true;
  };

  t.after(() => {
    process.stdout.write = originalWrite;
  });

  logger1.info("first");
  logger2.info("second");

  assert.equal(logs.length, 2);
  const first = JSON.parse(logs[0] ?? "{}");
  const second = JSON.parse(logs[1] ?? "{}");

  assert.equal(first.module, "module-1");
  assert.equal(first.msg, "first");
  assert.equal(second.module, "module-2");
  assert.equal(second.msg, "second");
});
