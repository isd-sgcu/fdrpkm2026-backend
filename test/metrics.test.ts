import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../src/db/schema";

const METRICS_TOKEN = "test-metrics-token";

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
let app: { handle: (request: Request) => Promise<Response> };

// Generous timeout: pglite boot + migrations + better-auth OpenAPI schema
// generation (app.ts top-level await) can exceed the 5s default on cold cache.
beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });

  // The metrics modules read `db` and `env` at import time, so both must be
  // mocked before app.ts (and through it metrics-db.ts) is first evaluated.
  mock.module("@src/db", () => ({ db }));
  const config = await import("../src/config");
  mock.module("@src/config", () => ({
    ...config,
    env: { ...config.env, METRICS_TOKEN }
  }));

  const [staff] = await db
    .insert(schema.students)
    .values({
      studentId: "6600000001",
      email: "staff@student.chula.ac.th",
      firstName: "Staff",
      lastName: "One",
      role: "staff"
    })
    .returning();
  const [freshman] = await db
    .insert(schema.students)
    .values({
      studentId: "6912345678",
      email: "freshman@student.chula.ac.th",
      firstName: "Fresh",
      lastName: "Man"
    })
    .returning();

  await db.insert(schema.registrations).values([
    { studentId: freshman!.id, project: "firstdate", pdpaAcceptedAt: new Date() },
    { studentId: freshman!.id, project: "rpkm", pdpaAcceptedAt: new Date() },
    { studentId: staff!.id, project: "rpkm", pdpaAcceptedAt: new Date() }
  ]);
  await db
    .insert(schema.entries)
    .values({ project: "firstdate", studentId: freshman!.id, scannedBy: staff!.id });

  const [house] = await db
    .insert(schema.houses)
    .values({ code: "house_a", capacity: 100 })
    .returning();
  const [group] = await db
    .insert(schema.groups)
    .values({ leaderId: freshman!.id, joinCode: "123456" })
    .returning();
  await db
    .insert(schema.groupHouseChoices)
    .values({ groupId: group!.id, houseId: house!.id, rank: 1 });

  const { createApp } = await import("../src/app");
  app = createApp();
}, 30_000);

afterAll(async () => {
  await client.close();
});

const scrape = (headers: Record<string, string> = {}) =>
  app.handle(new Request("http://localhost/metrics", { headers }));

describe("GET /metrics", () => {
  it("rejects a scrape without the bearer token", async () => {
    const response = await scrape();
    expect(response.status).toBe(401);
  });

  it("rejects a scrape with a wrong token", async () => {
    const response = await scrape({ authorization: "Bearer wrong" });
    expect(response.status).toBe(401);
  });

  it("serves the DB-state gauges with the right token", async () => {
    const response = await scrape({ authorization: `Bearer ${METRICS_TOKEN}` });
    expect(response.status).toBe(200);

    const body = await response.text();

    // DB-state gauges reflect the seeded rows.
    expect(body).toContain("fdrpkm_students 2");
    expect(body).toContain('fdrpkm_registrations{project="firstdate"} 1');
    expect(body).toContain('fdrpkm_registrations{project="rpkm"} 2');
    expect(body).toContain('fdrpkm_checkins{project="firstdate"} 1');
    expect(body).toContain("fdrpkm_groups 1");
    expect(body).toContain("fdrpkm_groups_assigned 0");
    expect(body).toContain('fdrpkm_house_capacity{house="house_a"} 100');
    expect(body).toContain('fdrpkm_house_demand{house="house_a",rank="1"} 1');
  });
});
