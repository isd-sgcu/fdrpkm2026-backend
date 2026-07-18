import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer, openAPI } from "better-auth/plugins";
// import { i18n } from "@better-auth/i18n";
import { db } from "@src/db";
import { env } from "@src/config";
import * as schema from "@src/db/schema";
import { logger } from "@src/utils/logger";

const authProtocol = env.BETTER_AUTH_URL.startsWith("https://") ? "https" : "http";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  appName: "fdrpkm2026",
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
      // Restricts Google sign-in to the chula.ac.th Workspace domain: sent
      // as the `hd` authorization hint and re-checked against the returned
      // id token's `hd` claim (personal @gmail.com accounts are rejected).
      hd: "student.chula.ac.th"
    }
  },
  secret: env.BETTER_AUTH_SECRET || "",
  advanced: {
    // The cufirstdate2026.com frontend (and localhost dev against staging) is
    // cross-site to api.rpkm2026.com, so cookies set on sign-in responses —
    // notably the OAuth `state` cookie — need SameSite=None or the browser
    // rejects them and the Google callback fails its state check.
    // SameSite=None requires Secure, so only apply over HTTPS; plain-http
    // local dev is same-site (localhost -> localhost) and Lax works there.
    // Browsers are phasing out unpartitioned third-party cookies (CHIPS);
    // Firefox already warns the OAuth state cookie "will soon be rejected
    // because it is foreign". Partitioned keeps cookies set on cross-site
    // fetch responses storable. Note a partitioned cookie set under a
    // frontend's partition is NOT sent on the top-level Google callback to
    // this API host — see account.skipStateCookieCheck below.
    ...(authProtocol === "https" && {
      defaultCookieAttributes: {
        sameSite: "none" as const,
        secure: true,
        partitioned: true
      }
    })
  },
  account: {
    // The OAuth state double-check cookie cannot round-trip for the
    // cross-site cufirstdate2026.com frontend: it is set on a cross-site
    // fetch response (partitioned under the frontend's site) but read on the
    // top-level Google callback at api.rpkm2026.com (its own partition), so
    // the browser never sends it back and the callback would fail with
    // state_security_mismatch. The state itself is still validated against
    // the single-use, 10-minute verification record in the database.
    skipStateCookieCheck: true
  },
  baseURL: {
    // Single shared API host (see README's "Two frontends, one backend,
    // one API host") — Better Auth checks the request's
    // `x-forwarded-host`/`Host` against this allowlist.
    allowedHosts: [
      "*.rpkm2026.com",
      "*.cufirstdate2026.com",
      ...(env.NODE_ENV !== "production" ? ["localhost:*"] : [])
    ],
    // Staging runs in development mode but still has an HTTPS public URL.
    protocol: authProtocol,
    // Direct auth.api calls with no request context (e.g. generateOpenAPISchema
    // at app startup) need a resolvable baseURL. Fall back to localhost outside
    // production when BETTER_AUTH_URL is unset (e.g. `bun test` with no .env);
    // production always sets it explicitly.
    fallback:
      env.BETTER_AUTH_URL || (env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined)
  },
  // Public endpoint is https://api.rpkm2026.com/v1/auth/* — keep in sync with
  // apiRoutes' "/v1" prefix in src/routes/index.ts.
  basePath: "/v1/auth",
  // Both frontends call this shared backend cross-origin — required for
  // cookie-mode sessions to pass Better Auth's origin/CSRF check. Dev/preview
  // add localhost (any port) and wildcard subdomains for PR preview deploys.
  trustedOrigins: [
    "https://cufirstdate2026.com",
    "https://www.cufirstdate2026.com",
    "https://rpkm2026.com",
    "https://www.rpkm2026.com",
    ...(env.NODE_ENV !== "production"
      ? ["http://localhost:*", "https://*.cufirstdate2026.com", "https://*.rpkm2026.com"]
      : [])
  ],
  plugins: [
    bearer(),
    openAPI()
    // i18n({
    //   translations: {},
    //   defaultLocale: "en"
    // })
  ],
  emailAndPassword: {
    enabled: false
  },
  // Better Auth enables its built-in rate limiter automatically in
  // production (100 req/min per IP, stricter on sign-in paths). All auth
  // traffic arrives via the two frontends' shared IPs/proxies, so the
  // per-IP limit throttles legitimate bursts (e.g. event-day sign-ins).
  rateLimit: {
    enabled: false
  },
  databaseHooks: {
    session: {
      create: {
        // A session row is created exactly once per successful sign-in
        // (Google callback), so this is the sign-in event for the log-based
        // metric. Requests through the mounted better-auth handler bypass
        // Elysia hooks, so this can't live in a route.
        after: async () => {
          logger.info("auth.sign_in", { event: "auth.sign_in" });
        }
      }
    }
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Only guard requests that carry an email (sign-in/sign-up); other
      // endpoints (session, openapi schema, ...) have no body to validate.
      if (ctx.body?.email && !ctx.body.email.endsWith("@student.chula.ac.th")) {
        throw new APIError("BAD_REQUEST", {
          message: "Email must end with @student.chula.ac.th"
        });
      }
    })
  }
});

// Security requirements referenced by route `detail.security`. The schemes
// themselves are defined in OpenAPI.components below.
export const authSecurity: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];
export const devKeySecurity: Record<string, string[]>[] = [{ devKey: [] }];

// Bridges the Better Auth openAPI() plugin schema into the Elysia Scalar docs:
// spread `components` and `getPaths()` into the openapi() `documentation` option.
let _schema: ReturnType<typeof auth.api.generateOpenAPISchema> | undefined;
const getSchema = () => (_schema ??= auth.api.generateOpenAPISchema());

export const OpenAPI = {
  getPaths: (prefix = "/v1/auth") =>
    getSchema().then(({ paths }) => {
      const reference: typeof paths = Object.create(null);

      for (const path of Object.keys(paths)) {
        const key = prefix + path;
        reference[key] = paths[path];

        for (const method of Object.keys(paths[path])) {
          const operation = (reference[key] as Record<string, { tags?: string[] }>)[method];
          operation.tags = ["Better Auth"];
        }
      }

      // Better Auth's OpenAPI types differ structurally from elysia's
      // openapi-types, but the generated document is valid OpenAPI 3.x.
      return reference as never;
    }),
  components: () =>
    getSchema().then(
      ({ components }) =>
        ({
          ...components,
          securitySchemes: {
            ...(components as { securitySchemes?: Record<string, unknown> }).securitySchemes,
            // Session cookie set by Better Auth after Google SSO sign-in.
            // Behind HTTPS the cookie is issued with the __Secure- prefix
            // (__Secure-better-auth.session_token).
            cookieAuth: {
              type: "apiKey",
              in: "cookie",
              name: "better-auth.session_token",
              description:
                "Better Auth session cookie (Google SSO). Named " +
                "`__Secure-better-auth.session_token` when served over HTTPS."
            },
            // Session token via the Better Auth bearer() plugin — the token
            // returned in the `set-auth-token` response header at sign-in.
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              description:
                "Better Auth session token (bearer() plugin), from the `set-auth-token` " +
                "header returned at sign-in."
            },
            // Dev-only tooling key (see src/routes/dev.ts); never in production.
            devKey: {
              type: "apiKey",
              in: "header",
              name: "x-dev-key",
              description: "DEV_API_KEY for dev-only endpoints. Never mounted in production."
            }
          }
        }) as never
    )
} as const;
