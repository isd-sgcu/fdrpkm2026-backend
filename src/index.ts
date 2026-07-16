import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const app = createApp().listen({
  hostname: env.HOST,
  port: env.PORT
});

logger.info("server.started", {
  host: app.server?.hostname,
  port: app.server?.port,
  env: env.NODE_ENV
});
