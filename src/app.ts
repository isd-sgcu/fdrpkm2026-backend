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
