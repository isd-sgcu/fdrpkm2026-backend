import { Registry, collectDefaultMetrics } from "prom-client";

// Dedicated registry (not the prom-client global) so tests can create apps
// repeatedly without "metric already registered" collisions from module
// re-evaluation, and so /metrics never leaks metrics from other libraries.
//
// Deliberately NO in-process event counters here. Cloud Run scrapes hit a
// random instance behind the load balancer and instances reset on every
// deploy/scale event, so per-instance counters produce fiction. Instead:
//   - state totals   -> DB gauges in metrics-db.ts (fdrpkm_*), same truth from
//                       every instance
//   - event rates    -> structured log events (`event:` field) aggregated by
//                       Cloud Logging log-based metrics across all instances;
//                       HTTP rates/latency come from the access log
//                       (src/plugins/request-logger.ts)
// Only per-process runtime metrics (memory, CPU, event loop) live here — those
// are genuinely per-instance.
export const metricsRegistry = new Registry();

try {
  // Node-oriented collectors (event loop lag, GC) may not all exist under Bun;
  // whatever is available still registers, and a hard failure here must never
  // take the app down.
  collectDefaultMetrics({ register: metricsRegistry });
} catch {
  // default metrics unavailable on this runtime — DB gauges still work
}
