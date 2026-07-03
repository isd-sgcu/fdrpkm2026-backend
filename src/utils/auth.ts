import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@src/db";
import { env } from "@src/config";
import { APIError, createAuthMiddleware } from "better-auth/api";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg"
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
