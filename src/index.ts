import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

// Bun.Image (used by the avatar pipeline) requires bun >= 1.3.14. Fail fast at
// startup rather than surfacing every upload as a misleading "not a decodable
// image" 400 on an older runtime.
if (typeof (Bun as { Image?: unknown }).Image === "undefined") {
  throw new Error("bun >= 1.3.14 is required (Bun.Image is unavailable on this runtime).");
}

const app = createApp().listen({
  hostname: env.HOST,
  port: env.PORT
});

logger.info("server.started", {
  host: app.server?.hostname,
  port: app.server?.port,
  env: env.NODE_ENV
});
