import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer, openAPI } from "better-auth/plugins";
// import { i18n } from "@better-auth/i18n";
import { db } from "@src/db";
import { env } from "@src/config";
import * as schema from "@src/db/schema";

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
      hd: "chula.ac.th"
    }
  },
  secret: env.BETTER_AUTH_SECRET || "",
  baseURL: {
    // This backend answers on two API hosts (one per frontend, see README's
    // "Two frontends, one backend, two API hosts") — allowlist both so
    // Better Auth accepts whichever `x-forwarded-host`/`Host` the request
    // actually arrived on, instead of only the single `BETTER_AUTH_URL` host.
    allowedHosts: [
      "fd-api.rpkm2026.com",
      "rpkm-api.rpkm2026.com",
      ...(env.NODE_ENV !== "production" ? ["localhost:*"] : [])
    ],
    protocol: env.NODE_ENV !== "production" ? "http" : "https",
    fallback: env.BETTER_AUTH_URL || undefined
  },
  // Public endpoint is https://<fd|rpkm>-api.rpkm2026.com/v1/auth/* — keep in
  // sync with apiRoutes' "/v1" prefix in src/routes/index.ts.
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
  components: () => getSchema().then(({ components }) => components as never)
} as const;
