import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/pglite";

import type { Database } from "../src/db";
import { createApp } from "../src/app";
import { createHealthRoutes } from "../src/routes/health";

describe("GET /v1/health", () => {
  it("returns service health (liveness — no DB check)", async () => {
    const app = createApp();
    const response = await app.handle(new Request("http://localhost/v1/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "fdrpkm2026-backend"
    });
  });
});

describe("GET /health/ready", () => {
  // A real (in-memory WASM) Postgres so readiness exercises an actual query,
  // not a mock. `SELECT 1` needs no schema, so no migration is required.
  let client: PGlite;
  let liveDb: Database;

  beforeAll(() => {
    client = new PGlite();
    liveDb = drizzle(client) as unknown as Database;
  });

  afterAll(async () => {
    await client.close();
  });

  it("returns ok when the database is reachable (readiness)", async () => {
    const app = createHealthRoutes(liveDb);
    const response = await app.handle(new Request("http://localhost/health/ready"));

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.status).toBe("ok");
    expect(typeof body.checks.database.latencyMs).toBe("number");
  });

  it("returns 503 when the database is unreachable", async () => {
    const brokenDb = {
      execute: async () => {
        throw new Error("connection refused");
      }
    } as unknown as Database;

    const app = createHealthRoutes(brokenDb);
    const response = await app.handle(new Request("http://localhost/health/ready"));

    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.checks.database.status).toBe("error");
  });
});
