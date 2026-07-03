import { defineConfig } from "drizzle-kit";

if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
  throw new Error("drizzle-kit should only be run in development or test environments");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  driver: "pglite",
  dbCredentials: {
    url: `file:${process.env.DATABASE_FILE}`
  }
});
