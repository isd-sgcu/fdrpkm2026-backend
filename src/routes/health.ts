import { sql } from "drizzle-orm";
import { Elysia } from "elysia";

import { db, type Database } from "@src/db";

// Factory so tests can inject a database, matching the injection pattern the
// service/helper tests already use. Production mounts `healthRoutes` below,
// which binds the shared singleton `db`.
export const createHealthRoutes = (database: Database = db) =>
  new Elysia({ prefix: "/health" })
    // Liveness — "is the process running?" No dependencies, always cheap.
    // Point Cloud Run's own container health check here: a brief database
    // blip must NOT make Cloud Run kill and restart otherwise-healthy
    // containers, or a 2s hiccup becomes a full outage.
    .get(
      "/",
      () => ({
        status: "ok",
        service: "fdrpkm2026-backend"
      }),
      {
        detail: {
          tags: ["Health"],
          summary: "Liveness probe",
          description:
            "Is the process running? No dependencies, always cheap. Cloud Run's container " +
            "health check points here so a brief database blip never restarts healthy containers."
        }
      }
    )
    // Readiness — "can we actually serve traffic right now?" Runs a trivial
    // query to confirm the Postgres connection is alive. Point the GCP uptime
    // check here. Returns 503 when the DB is unreachable so alerts can fire.
    .get(
      "/ready",
      async ({ status }) => {
        const startedAt = performance.now();

        try {
          await database.execute(sql`SELECT 1`);

          return {
            status: "ok",
            service: "fdrpkm2026-backend",
            checks: {
              database: {
                status: "ok",
                latencyMs: Math.round(performance.now() - startedAt)
              }
            }
          };
        } catch (error) {
          return status(503, {
            status: "error",
            service: "fdrpkm2026-backend",
            checks: {
              database: {
                status: "error",
                message: error instanceof Error ? error.message : "unknown error"
              }
            }
          });
        }
      },
      {
        detail: {
          tags: ["Health"],
          summary: "Readiness probe",
          description:
            "Can we actually serve traffic right now? Runs `SELECT 1` to confirm the Postgres " +
            "connection is alive. Returns 503 when the database is unreachable — point the GCP " +
            "uptime check here so alerts can fire."
        }
      }
    );

export const healthRoutes = createHealthRoutes();
