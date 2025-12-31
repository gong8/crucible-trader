/**
 * Test runner tools for MCP server.
 * Allows running tests for the Crucible Trader codebase.
 */

import { spawn } from "node:child_process";
import type { Database as SQLiteDatabase } from "sqlite";
import type sqlite3 from "sqlite3";
import { getRepoRoot } from "../db.js";
import type { RegisterTool } from "../types.js";
import { createMcpLogger } from "../logger.js";

const logger = createMcpLogger("@crucible-trader/mcp-server/tools/test");

type SqliteInstance = SQLiteDatabase<sqlite3.Database, sqlite3.Statement>;

/**
 * Run a command and capture output.
 */
async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 0, stdout, stderr });
    });

    proc.on("error", (error) => {
      stderr += error.message;
      resolve({ exitCode: 1, stdout, stderr });
    });
  });
}

/**
 * Register test-related tools.
 */
export async function registerTestTools(
  _db: SqliteInstance,
  registerTool: RegisterTool,
): Promise<void> {
  /**
   * Run all tests.
   */
  registerTool(
    "run_tests",
    "Run the full test suite for Crucible Trader.",
    {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description:
            "Optional package filter (e.g., '@crucible-trader/data', '@crucible-trader/engine')",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 300)",
        },
      },
    },
    async (args) => {
      const filter = args.filter as string | undefined;
      const timeout = ((args.timeout as number) ?? 300) * 1000;

      logger.info("Running tests", { filter, timeout });

      const repoRoot = getRepoRoot();
      const command = "pnpm";
      const cmdArgs: string[] = [];

      if (filter) {
        cmdArgs.push("--filter", filter);
      } else {
        cmdArgs.push("-r");
      }

      cmdArgs.push("test");

      const startTime = Date.now();
      const result = await Promise.race([
        runCommand(command, cmdArgs, repoRoot),
        new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) =>
          setTimeout(
            () =>
              resolve({
                exitCode: 124,
                stdout: "",
                stderr: `Test execution timed out after ${timeout / 1000}s`,
              }),
            timeout,
          ),
        ),
      ]);

      const executionTimeMs = Date.now() - startTime;

      const success = result.exitCode === 0;
      const output = result.stdout + (result.stderr ? `\n\nSTDERR:\n${result.stderr}` : "");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success,
                exitCode: result.exitCode,
                executionTimeMs,
                output: output.slice(-5000), // Last 5000 chars to avoid huge responses
                filter: filter ?? "all packages",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /**
   * Run linting.
   */
  registerTool(
    "run_lint",
    "Run ESLint on the Crucible Trader codebase.",
    {
      type: "object",
      properties: {},
    },
    async () => {
      logger.info("Running lint");

      const repoRoot = getRepoRoot();
      const result = await runCommand("pnpm", ["run", "lint"], repoRoot);

      const success = result.exitCode === 0;
      const output = result.stdout + (result.stderr ? `\n\nSTDERR:\n${result.stderr}` : "");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success,
                exitCode: result.exitCode,
                output: output.slice(-5000),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /**
   * Build all packages.
   */
  registerTool(
    "build_all",
    "Build all packages in the Crucible Trader monorepo.",
    {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Optional package filter (e.g., '@crucible-trader/engine')",
        },
      },
    },
    async (args) => {
      const filter = args.filter as string | undefined;

      logger.info("Building packages", { filter });

      const repoRoot = getRepoRoot();
      const command = "pnpm";
      const cmdArgs: string[] = [];

      if (filter) {
        cmdArgs.push("--filter", filter);
      } else {
        cmdArgs.push("-r");
      }

      cmdArgs.push("build");

      const startTime = Date.now();
      const result = await runCommand(command, cmdArgs, repoRoot);
      const executionTimeMs = Date.now() - startTime;

      const success = result.exitCode === 0;
      const output = result.stdout + (result.stderr ? `\n\nSTDERR:\n${result.stderr}` : "");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success,
                exitCode: result.exitCode,
                executionTimeMs,
                output: output.slice(-5000),
                filter: filter ?? "all packages",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /**
   * Install dependencies.
   */
  registerTool(
    "install_dependencies",
    "Install or update dependencies using pnpm install.",
    {
      type: "object",
      properties: {},
    },
    async () => {
      logger.info("Installing dependencies");

      const repoRoot = getRepoRoot();
      const result = await runCommand("pnpm", ["install"], repoRoot);

      const success = result.exitCode === 0;
      const output = result.stdout + (result.stderr ? `\n\nSTDERR:\n${result.stderr}` : "");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success,
                exitCode: result.exitCode,
                output: output.slice(-5000),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
