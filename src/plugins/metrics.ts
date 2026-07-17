import { Elysia } from "elysia";

import { env } from "@src/config";
import { metricsRegistry } from "@src/utils/metrics";
// Side-effect import: registers the DB-state gauges (fdrpkm_*) on the registry.
import "@src/utils/metrics-db";

/**
 * Prometheus scrape endpoint. Serves the DB-state gauges (metrics-db.ts) and
 * per-process runtime metrics. Event rates deliberately come from Cloud
 * Logging log-based metrics, not from here — see the note in utils/metrics.ts.
 */
export const metricsPlugin = new Elysia({ name: "metrics" }).get(
  "/metrics",
  async ({ headers, status }) => {
    // Fail closed like DEV_API_KEY: no METRICS_TOKEN configured -> nobody
    // scrapes. Prometheus sends it via `authorization: Bearer <token>`
    // (scrape_config `authorization.credentials`).
    if (!env.METRICS_TOKEN || headers.authorization !== `Bearer ${env.METRICS_TOKEN}`) {
      return status(401, "Unauthorized");
    }

    return new Response(await metricsRegistry.metrics(), {
      headers: { "content-type": metricsRegistry.contentType }
    });
  }
);
