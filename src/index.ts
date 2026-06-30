import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp().listen({
  hostname: env.HOST,
  port: env.PORT
});

console.log(`fdrpkm2026-backend is running at http://${app.server?.hostname}:${app.server?.port}`);
