import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { RiskProfileSchema, assertValid, type RiskProfile } from "@crucible-trader/sdk";

interface RiskProfileRouteDeps {
  readonly listRiskProfiles: () => Promise<RiskProfile[]>;
  readonly saveRiskProfile: (profile: RiskProfile) => Promise<void>;
}

export const registerRiskProfileRoutes = (
  app: FastifyInstance,
  deps: RiskProfileRouteDeps,
): void => {
  app.get("/api/risk-profiles", async (_request, reply) => {
    const profiles = await deps.listRiskProfiles();
    return reply.send(profiles);
  });

  app.post(
    "/api/risk-profiles",
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<FastifyReply> => {
      let payload: RiskProfile;
      try {
        payload = assertValid(RiskProfileSchema, request.body, "RiskProfile");
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid profile";
        return reply.code(400).send({ message });
      }

      await deps.saveRiskProfile(payload);
      return reply.code(201).send(payload);
    },
  );
};
