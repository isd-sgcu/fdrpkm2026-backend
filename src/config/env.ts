const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_NODE_ENV = "development";
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_DATABASE_FILE = "./local.db";
const DEFAULT_DATABASE_URL = "";

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
};

export const env = {
  PORT: parsePort(process.env.PORT),
  HOST: process.env.HOST || DEFAULT_HOST,
  NODE_ENV: process.env.NODE_ENV || DEFAULT_NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
  // Optional. When set, structured logs include a Cloud Trace correlation id
  // (logging.googleapis.com/trace) so a request's logs link to its trace in
  // the GCP console. Cloud Run does NOT set this automatically — pass it as a
  // deploy env var to enable the linkage; logs still carry a plain traceId
  // without it.
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "",
  DATABASE_URL: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  DATABASE_FILE: process.env.DATABASE_FILE || DEFAULT_DATABASE_FILE,
  // Max Postgres connections PER instance. Total server connections =
  // DB_POOL_MAX × Cloud Run max-instances, which must stay under Cloud SQL
  // max_connections (currently 800). At max-instances 80, 8 → 640, leaving
  // room for dev (shares this instance), migrations, and the superuser reserve.
  DB_POOL_MAX: Number(process.env.DB_POOL_MAX) || 8,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  // Shared secret for the /v1/dev/* endpoints (see src/routes/dev.ts). The
  // routes are only mounted when NODE_ENV=development, but staging also runs
  // in development mode on a public URL — so every dev endpoint additionally
  // requires this value in an `x-dev-key` header. Unset = dev endpoints
  // always reject (fail closed).
  DEV_API_KEY: process.env.DEV_API_KEY || "",
  // Bearer token Prometheus must present to scrape GET /metrics (see
  // src/plugins/metrics.ts). Unset = /metrics always rejects (fail closed) —
  // must default to "" (falsy), NOT a literal, or the endpoint accepts a
  // well-known token committed to the repo.
  METRICS_TOKEN: process.env.METRICS_TOKEN || "",
  // S3-compatible object storage for uploads (Cloudflare R2 or any S3 API).
  // See docs/upload-guide.md.
  S3_ENDPOINT: process.env.S3_ENDPOINT || "",
  S3_REGION: process.env.S3_REGION || "auto",
  S3_BUCKET: process.env.S3_BUCKET || "",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || "",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || "",
  // Public base URL uploaded objects are served from (public bucket/CDN
  // domain), e.g. https://storage.googleapis.com/<bucket>. REQUIRED for avatar
  // uploads — the stored user.image URL is built from it. Leaving it unset
  // makes uploads fail loudly (see src/utils/storage.ts) rather than persist an
  // expiring presigned URL.
  ASSET_BASE_URL: process.env.ASSET_BASE_URL || ""
} as const;

// Browser origins allowed to make credentialed (cookie) requests to this API.
// Mirrors better-auth's trustedOrigins (src/utils/auth.ts). Used to pin CORS
// and to reject cross-site state-changing requests on cookie-authed routes
// (CSRF defense), since better-auth's own origin check does not cover custom
// Elysia routes like /v1/me/avatar.
const PROD_ORIGINS = ["https://cufirstdate2026.com", "https://rpkm2026.com"];
const DEV_ORIGIN_PATTERNS = [
  /^http:\/\/localhost:\d+$/,
  /^https:\/\/([a-z0-9-]+\.)?cufirstdate2026\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?rpkm2026\.com$/
];

/** True if `origin` (a browser Origin header value) is a trusted frontend. */
export const isAllowedOrigin = (origin: string): boolean =>
  PROD_ORIGINS.includes(origin) ||
  (env.NODE_ENV !== "production" && DEV_ORIGIN_PATTERNS.some((re) => re.test(origin)));

/** Value for @elysiajs/cors `origin` (string | RegExp entries). */
export const corsOrigins: (string | RegExp)[] =
  env.NODE_ENV === "production" ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGIN_PATTERNS];
