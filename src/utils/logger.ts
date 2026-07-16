import { env } from "@src/config";

// Severity names match the values Cloud Logging understands, so an emitted
// `severity` field colours and filters correctly in the Logs Explorer
// (DEBUG < INFO < WARNING < ERROR < CRITICAL).
export type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
  CRITICAL: 50
};

// Map the human-friendly LOG_LEVEL env ("debug" | "info" | "warn" | "error")
// to a minimum severity. Anything below the threshold is dropped.
const LEVEL_TO_SEVERITY: Record<string, Severity> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  warning: "WARNING",
  error: "ERROR",
  critical: "CRITICAL"
};

const minWeight = SEVERITY_WEIGHT[LEVEL_TO_SEVERITY[env.LOG_LEVEL.toLowerCase()] ?? "INFO"];

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  critical: (message: string, fields?: LogFields) => void;
  /** Return a logger that stamps `bound` onto every entry (e.g. a traceId). */
  child: (bound: LogFields) => Logger;
}

// Cloud Logging turns a single JSON line on stdout/stderr into a structured log
// entry. A few keys are special:
//   severity                     -> the log level (colour/filter in the UI)
//   message                      -> the summary line shown in the Logs Explorer
//   time                         -> the entry timestamp (RFC 3339)
//   logging.googleapis.com/trace -> links the entry to a Cloud Trace
//   httpRequest                  -> rendered as a request line (method/status/latency)
// Every other key lands under jsonPayload and is fully searchable/aggregatable
// — which is what lets us build log-based metrics (e.g. requests per endpoint,
// registrations, check-ins) without any extra tooling like Prometheus.
const emit = (severity: Severity, message: string, fields: LogFields): void => {
  if (SEVERITY_WEIGHT[severity] < minWeight) return;

  const entry: Record<string, unknown> = {
    severity,
    message,
    time: new Date().toISOString(),
    ...fields
  };

  const traceId = fields.traceId;
  if (env.GCP_PROJECT_ID && typeof traceId === "string") {
    entry["logging.googleapis.com/trace"] = `projects/${env.GCP_PROJECT_ID}/traces/${traceId}`;
  }

  const line = `${JSON.stringify(entry)}\n`;

  // ERROR+ to stderr, the rest to stdout. Cloud Logging keys off the `severity`
  // field regardless of stream, but keeping errors on stderr matches convention
  // and reads better in raw local output.
  if (SEVERITY_WEIGHT[severity] >= SEVERITY_WEIGHT.ERROR) {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
};

const createLogger = (bound: LogFields = {}): Logger => {
  const at =
    (severity: Severity) =>
    (message: string, fields: LogFields = {}) =>
      emit(severity, message, { ...bound, ...fields });

  return {
    debug: at("DEBUG"),
    info: at("INFO"),
    warn: at("WARNING"),
    error: at("ERROR"),
    critical: at("CRITICAL"),
    child: (extra) => createLogger({ ...bound, ...extra })
  };
};

// App-wide logger. Inside request handling, prefer the request-scoped child
// (carrying a traceId) provided by the request-logger plugin.
export const logger = createLogger();
