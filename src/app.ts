import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { env } from "@src/config";
import { apiRoutes } from "@src/routes";
import { authMiddleware } from "@src/routes/auth";
import { AppError, errorResponse, OpenAPI } from "@src/utils";

// Resolved once at module load (top-level await) so createApp stays sync.
const authDocs =
  env.NODE_ENV === "production"
    ? undefined
    : {
        components: await OpenAPI.components(),
        paths: await OpenAPI.getPaths()
      };

export const createApp = () =>
  new Elysia()
    .onError(({ error, code, status }) => {
      // Domain errors thrown by services/guards. Checked via instanceof, not
      // the `code` switch: Elysia derives `code` from the thrown error's own
      // `code` property, which for AppError is the domain code ("FORBIDDEN",
      // "NOT_FOUND", ...) — it would never equal a registered class name.
      if (error instanceof AppError) {
        return status(error.httpStatus, errorResponse(error.code, error.context));
      }
      switch (code) {
        case "VALIDATION":
          return status(400, error.detail(error.message));
        case "NOT_FOUND":
          return status(404, errorResponse("NOT_FOUND", { message: error.message }));
        case "INTERNAL_SERVER_ERROR":
          return status(500, errorResponse("INTERNAL_SERVER_ERROR", { message: error.message }));
        case "INVALID_COOKIE_SIGNATURE":
          return status(403, errorResponse("INVALID_COOKIE_SIGNATURE", { message: error.message }));
        case "INVALID_FILE_TYPE":
          return status(400, errorResponse("INVALID_FILE_TYPE", { message: error.message }));
        case "PARSE":
          return status(400, new Response(error.message, { status: 400 }));
        default:
          // Unexpected (non-domain) error — keep the standard envelope and
          // never leak the raw error to the client.
          console.error("Unexpected error:", error);
          return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
    })
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
              },
              components: authDocs?.components,
              paths: authDocs?.paths
            }
          })
    )
    .get("/", () => ({
      name: "fdrpkm2026-backend",
      version: "0.1.0"
    }))
    .use(authMiddleware)
    .use(apiRoutes);
