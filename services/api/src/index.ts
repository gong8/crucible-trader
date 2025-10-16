import { createLogger } from "@crucible-trader/logger";

import { createFastifyServer } from "./server.js";

const PORT = Number(process.env.PORT ?? "3000");
const HOST = process.env.HOST ?? "0.0.0.0";

const server = createFastifyServer();

const logger = createLogger("services/api");

const start = async (): Promise<void> => {
  try {
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
