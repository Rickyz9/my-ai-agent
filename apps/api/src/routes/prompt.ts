import type { FastifyInstance } from "fastify";

import { composePrompt } from "@repo/ollama";
import { composePromptInputSchema } from "@repo/shared";

import { env } from "../lib/config.js";

export async function registerPromptRoutes(app: FastifyInstance) {
  app.post("/api/prompt/compose", async (request, reply) => {
    const parsed = composePromptInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.flatten()
      });
    }

    try {
      const result = await composePrompt(
        {
          baseUrl: env.OLLAMA_URL,
          model: env.OLLAMA_MODEL
        },
        parsed.data
      );

      return result;
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
