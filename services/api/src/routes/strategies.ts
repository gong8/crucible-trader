import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { forceReloadCustomStrategies } from "@crucible-trader/engine";
import { createLogger } from "@crucible-trader/logger";

const logger = createLogger("@crucible-trader/api/routes/strategies");

/**
 * Register strategy-related routes.
 */
export const registerStrategiesRoutes = (app: FastifyInstance): void => {
  /**
   * POST /api/strategies/reload
   * Force reload custom strategies from storage/strategies/custom/
   */
  app.post(
    "/api/strategies/reload",
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      try {
        logger.info("Forcing custom strategies reload");
        await forceReloadCustomStrategies();
        logger.info("Custom strategies reloaded successfully");

        return reply.send({
          success: true,
          message: "Custom strategies reloaded",
        });
      } catch (error) {
        logger.error("Failed to reload custom strategies", { error });
        return reply.code(500).send({
          success: false,
          error: "Failed to reload custom strategies",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
};
