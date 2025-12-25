import { config as loadEnv } from "dotenv";
import type { FastifyInstance } from "fastify";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(MODULE_DIR, "..", "..", "..");
loadEnv({ path: join(REPO_ROOT, ".env") });
loadEnv();

import { createLogger } from "@crucible-trader/logger";

import { createFastifyServer } from "./server.js";

const PORT = Number(process.env.PORT ?? "3000");
const HOST = process.env.HOST ?? "0.0.0.0";

const logger = createLogger("services/api");
let server: FastifyInstance | null = null;

const start = async (): Promise<void> => {
  try {
    server = await createFastifyServer();
    await server.listen({ port: PORT, host: HOST });
    logger.info("API listening", { port: PORT, host: HOST });
  } catch (error) {
    logger.error("Failed to start API", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

const shutdown = async (): Promise<void> => {
  if (!server) {
    process.exit(0);
    return;
  }
  logger.info("Shutting down API server");
  await server.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

void start();
