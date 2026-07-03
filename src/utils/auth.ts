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
      clientSecret: env.GOOGLE_CLIENT_SECRET || ""
    }
  },
  secret: env.BETTER_AUTH_SECRET || "",
  baseURL: env.BETTER_AUTH_URL || "",
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
      if (!ctx.body?.email.endsWith("@student.chula.ac.th")) {
        throw new APIError("BAD_REQUEST", {
          message: "Email must end with @student.chula.ac.th"
        });
      }
    })
  }
});
