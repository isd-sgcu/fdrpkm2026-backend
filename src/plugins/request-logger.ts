import { Elysia } from "elysia";

import { logger, type Logger } from "@src/utils/logger";

// Cloud Run tags every inbound request with:
//   X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=TRACE_TRUE
// We keep TRACE_ID so every log line for one request shares an id (and, when
// GCP_PROJECT_ID is set, links to Cloud Trace). Locally the header is absent,
// so we mint a uuid instead. Exported so the app's error handler can stamp the
// same id onto unhandled-error logs.
export const traceIdFrom = (header: string | null | undefined): string => {
  const traceId = header?.split("/")[0];
  return traceId && traceId.length > 0 ? traceId : crypto.randomUUID();
};

// Resolve the final HTTP status. `set.status` is authoritative once the error
// handler has run (which is why this hook must be registered AFTER onError —
// see app.ts). We still fall back to the response value so an explicit
// `status(code, ...)` is captured even if `set.status` was never populated.
//
// Known caveat: responses from the raw `.mount()` better-auth handler (the
// /v1/auth/* endpoints and the non-auth catch-all 404) bypass Elysia's response
// pipeline, so those access logs report status 200. Every normal Elysia route
// (registration, check-in, QR, announcement, ...) reports correctly — those are
// the endpoints the traffic/error dashboards care about.
const resolveStatus = (ctx: {
  set: { status?: number | string };
  responseValue?: unknown;
}): number => {
  const raw = ctx.set.status;
  if (typeof raw === "number") return raw;

  const rv = ctx.responseValue;
  if (rv instanceof Response) return rv.status;
  if (rv !== null && typeof rv === "object") {
    const code = (rv as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return 200;
};

// Status decides how loud the access log is: 5xx = error, 4xx = warning
// (usually the caller's fault), everything else = info.
const levelForStatus = (code: number): "error" | "warn" | "info" =>
  code >= 500 ? "error" : code >= 400 ? "warn" : "info";

export const requestLogger = new Elysia({ name: "request-logger" })
  // Per-request context: a trace id, a request-scoped logger, and a start time.
  // `traceId` and `log` are usable inside handlers too, e.g.
  //   .get("/x", ({ log }) => { log.info("fd.registration.created", { ... }); })
  // which is how business events (registrations, check-ins) get logged for the
  // dashboard's log-based metrics.
  .derive({ as: "global" }, ({ headers }) => {
    const traceId = traceIdFrom(headers["x-cloud-trace-context"]);
    return {
      traceId,
      log: logger.child({ traceId }),
      requestStartedAt: performance.now()
    };
  })
  // Access log — emitted AFTER the response is sent, so it adds no latency to
  // the request. Carries method + endpoint + status + duration: the raw
  // material for "requests per second per endpoint" as a log-based metric.
  .onAfterResponse({ as: "global" }, (ctx) => {
    const log: Logger = ctx.log ?? logger;
    const status = resolveStatus(ctx);
    const durationMs =
      typeof ctx.requestStartedAt === "number"
        ? Math.round(performance.now() - ctx.requestStartedAt)
        : undefined;

    log[levelForStatus(status)](`${ctx.request.method} ${ctx.path} ${status}`, {
      // `route` is the matched pattern (e.g. "/v1/rpkm/users/:id") — low
      // cardinality, so it's the right label to group a per-endpoint metric by.
      // `requestUrl` is the actual path (with real ids) for debugging.
      route: ctx.route,
      httpRequest: {
        requestMethod: ctx.request.method,
        requestUrl: ctx.path,
        status,
        latency: durationMs === undefined ? undefined : `${(durationMs / 1000).toFixed(3)}s`
      },
      durationMs
    });
  });
