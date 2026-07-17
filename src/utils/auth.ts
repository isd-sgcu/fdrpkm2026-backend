import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer, openAPI } from "better-auth/plugins";
// import { i18n } from "@better-auth/i18n";
import { db } from "@src/db";
import { env } from "@src/config";
import * as schema from "@src/db/schema";

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
    ...(authProtocol === "https" && {
      defaultCookieAttributes: {
        sameSite: "none" as const,
        secure: true
      }
    })
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
    "https://rpkm2026.com",
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
