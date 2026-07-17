import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import { drizzle as drizzlePG, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@src/config";
import * as schema from "@src/db/schema";
// Direct import (not the "@src/utils" barrel): the barrel pulls in auth.ts,
// which imports this db module — importing the logger directly avoids the cycle.
import { logger } from "@src/utils/logger";

const usePGlite = env.NODE_ENV === "development" && !env.DATABASE_URL;

// node-postgres emits 'error' on the Pool when an *idle* pooled client's
// connection drops (DB restart, idle-timeout kill, network blip). With no
// listener attached, Node treats it as an uncaught exception and kills the
// whole process — even with no request in flight. Log it instead; the pool
// discards the bad client and the next query gets a fresh one.
const createPgPool = (): Pool => {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Bounded per-instance pool so horizontal scaling can't exhaust Cloud SQL
    // connections (see env.DB_POOL_MAX). Under burst, wait up to 10s for a free
    // connection rather than erroring instantly.
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  pool.on("error", (err) => {
    logger.error("db.idle_client_error", {
      errorMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
  });
  return pool;
};

// Single Drizzle instance for the app: local dev (no DATABASE_URL) runs on
// PGlite (WASM Postgres, file-backed), everywhere else on real Postgres. Both
// expose the same query-builder + transaction surface, so the PGlite arm is
// cast to the node-postgres type and the rest of the app treats `db` as one
// `Database` type — notably a typed `db.transaction`, which the RPKM
// registration flow relies on.
export const db = (usePGlite
  ? drizzlePGlite(env.DATABASE_FILE, { schema })
  : drizzlePG({ client: createPgPool(), schema })) as unknown as NodePgDatabase<typeof schema>;

export type Database = typeof db;
