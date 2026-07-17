import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { requestLogger, traceIdFrom } from "@src/plugins/request-logger";
import { corsOrigins, env } from "@src/config";
import { apiRoutes } from "@src/routes";
import { authMiddleware } from "@src/routes/auth";
import { AppError, errorResponse, OpenAPI } from "@src/utils";
import { logger } from "@src/utils/logger";

// Resolved once at module load (top-level await) so createApp stays sync.
const authDocs =
  env.NODE_ENV === "production"
    ? undefined
    : {
        components: await OpenAPI.components(),
        paths: await OpenAPI.getPaths()
      };

// Cap the whole request body at 20MB. The largest legitimate body is the 15MB
// avatar upload plus multipart overhead; without this, Bun's 128MB default lets
// an attacker force the server to buffer ~128MB per request before any
// validation runs. Bodies over the cap are rejected at the transport layer.
const MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024;

export const createApp = () =>
  new Elysia({ serve: { maxRequestBodySize: MAX_REQUEST_BODY_BYTES } })
    .onError(({ error, code, status, request }) => {
      // Domain errors thrown by services/guards. Checked via instanceof, not
      // the `code` switch: Elysia derives `code` from the thrown error's own
      // `code` property, which for AppError is the domain code ("FORBIDDEN",
      // "NOT_FOUND", ...) — it would never equal a registered class name.
      if (error instanceof AppError) {
        return status(error.httpStatus, errorResponse(error.code, error.context));
      }
      switch (code) {
        case "VALIDATION": {
          // Same envelope as every other error; context carries the first
          // failing property so the client can point at the field.
          const first = error.all[0];
          return status(
            400,
            errorResponse("VALIDATION", {
              on: error.type,
              property: first && "path" in first ? first.path : undefined,
              summary: first?.summary
            })
          );
        }
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
          // Unexpected (non-domain) error — log a structured entry with a
          // stack (searchable in Cloud Logging), keep the standard envelope,
          // and never leak the raw error to the client.
          logger.error("unhandled_error", {
            traceId: traceIdFrom(request.headers.get("x-cloud-trace-context")),
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
    })
    // Trace id + request-scoped logger + access logging, applied app-wide.
    // Registered AFTER onError so the access log's onAfterResponse reads the
    // final status (including statuses the error handler sets above).
    .use(requestLogger)
    // Explicit allowlist instead of the reflect-any-origin default — only the
    // known frontends may make credentialed cross-origin calls. `set-auth-token`
    // must be exposed for the bearer() fallback: browsers that block third-party
    // cookies need frontend JS to read the session token from that header.
    .use(cors({ origin: corsOrigins, credentials: true, exposeHeaders: ["set-auth-token"] }))
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
              // Sidebar grouping + descriptions for the Scalar UI. Routes pick a
              // tag via `detail.tags`; untagged better-auth paths are tagged
              // "Better Auth" in OpenAPI.getPaths (src/utils/auth.ts).
              tags: [
                {
                  name: "Health",
                  description: "Liveness/readiness probes for Cloud Run and GCP uptime checks."
                },
                {
                  name: "Better Auth",
                  description: "Authentication (Google SSO via better-auth, mounted at /v1/auth)."
                },
                {
                  name: "FirstDate - Users",
                  description: "FirstDate registration flow: register, profile, my info."
                },
                {
                  name: "FirstDate - Check-in",
                  description: "Staff entry scans for the FirstDate event."
                },
                {
                  name: "RPKM - Users",
                  description: "RPKM registration flow: register, profile, my info."
                },
                {
                  name: "RPKM - Check-in",
                  description: "Staff entry scans for RPKM and Freshmen Night."
                },
                {
                  name: "RPKM - Groups",
                  description: "Group management: join codes, members, house preferences."
                },
                {
                  name: "RPKM - Houses",
                  description: "House catalog, demand stats, preference confirmation, results."
                },
                {
                  name: "RPKM - Games",
                  description: "Jigsaw and CSR checkpoint games: progress and geofenced collection."
                },
                {
                  name: "RPKM - Walk Rally",
                  description:
                    "Workshops/museums/minigame: round pre-registration and staff attendance scans."
                },
                {
                  name: "Dev",
                  description:
                    "Dev-only tooling (personas, impersonation, seeding). Requires x-dev-key; never mounted in production."
                },
                {
                  name: "Example",
                  description: "Reference routes showing the controller pattern. Dev-only."
                }
              ],
              components: authDocs?.components,
              paths: authDocs?.paths
            }
          })
    )
    .get(
      "/",
      () => ({
        name: "fdrpkm2026-backend",
        version: "0.1.0"
      }),
      {
        detail: {
          tags: ["Health"],
          summary: "Service info",
          description: "Service name and version — quick way to confirm the API is up."
        }
      }
    )
    .use(authMiddleware)
    .use(apiRoutes);

export type App = ReturnType<typeof createApp>;
