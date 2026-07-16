import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

// The migration workflow supplies DATABASE_URL through the Cloud SQL Auth
// Proxy. Developers without a Postgres URL continue to use local PGlite.
const config = databaseUrl
  ? defineConfig({
      dialect: "postgresql",
      schema: "./src/db/schema/index.ts",
      out: "./drizzle",
      dbCredentials: { url: databaseUrl }
    })
  : (() => {
      if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
        throw new Error("DATABASE_URL is required when drizzle-kit is not running locally");
      }

      return defineConfig({
        dialect: "postgresql",
        schema: "./src/db/schema/index.ts",
        out: "./drizzle",
        driver: "pglite",
        dbCredentials: {
          url: `file:${process.env.DATABASE_FILE}`
        }
      });
    })();

export default config;
