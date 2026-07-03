import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import { drizzle as drizzlePG } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@src/config";

const usePGlite = env.NODE_ENV === "development" && !env.DATABASE_URL;

export const db = usePGlite
  ? drizzlePGlite(env.DATABASE_FILE)
  : drizzlePG({ client: new Pool({ connectionString: env.DATABASE_URL }) });
