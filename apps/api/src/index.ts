import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { env } from "./lib/config.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerLearningRoutes } from "./routes/learning.js";
import { registerModelRoutes } from "./routes/models.js";
import { registerPromptRoutes } from "./routes/prompt.js";

const app = Fastify({
  logger: true,
  bodyLimit: env.API_BODY_LIMIT_MB * 1024 * 1024
});

app.addContentTypeParser(/^image\/.*/, { parseAs: "buffer", bodyLimit: env.API_BODY_LIMIT_MB * 1024 * 1024 }, (_request, body, done) => {
  done(null, body);
});

app.addContentTypeParser(
  "application/octet-stream",
  { parseAs: "buffer", bodyLimit: env.API_BODY_LIMIT_MB * 1024 * 1024 },
  (_request, body, done) => {
  done(null, body);
  }
);

await app.register(cors, {
  origin: true
});

await app.register(fastifyStatic, {
  root: env.DATA_DIR,
  prefix: "/data/"
});

await registerHealthRoutes(app);
await registerPromptRoutes(app);
await registerJobRoutes(app);
await registerAssetRoutes(app);
await registerModelRoutes(app);
await registerLearningRoutes(app);

app.get("/", async () => ({
  name: "local-gen-api",
  docs: ["/api/health", "/api/prompt/compose", "/api/jobs", "/api/assets", "/api/models", "/api/learning/summary"]
}));

await app.listen({
  port: env.PORT,
  host: "0.0.0.0"
});
