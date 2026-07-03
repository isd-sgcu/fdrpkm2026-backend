import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { env } from "@src/config";
import { apiRoutes } from "@src/routes";
import { authMiddleware } from "@src/routes/auth";

export const createApp = () =>
  new Elysia()
    .use(cors())
    // OpenAPI docs (Scalar UI at /openapi) — dev/staging only, not in production.
    .use(
      env.NODE_ENV === "production"
        ? new Elysia()
        : openapi({
            documentation: {
              info: {
                title: "fdrpkm2026-backend",
                version: "0.1.0"
              }
            }
          })
    )
    .get("/", () => ({
      name: "fdrpkm2026-backend",
      version: "0.1.0"
    }))
    .use(authMiddleware)
    .as("global")
    .use(apiRoutes);
