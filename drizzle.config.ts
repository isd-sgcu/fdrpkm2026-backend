import { defineConfig } from "drizzle-kit";

// `generate` needs only schema + dialect + out. `migrate`/`push`/`studio`
// additionally need DATABASE_URL (set it in .env when the DB exists).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  }
});
