import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { GamesService } from "../src/services/games.service";

let mockEventActive = true;
const isEventActiveMock = mock((eventName: string) => {
  void eventName;
  return mockEventActive;
});

mock.module("../src/utils/flags", () => ({
  isEventActive: isEventActiveMock
}));

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
const injected = (): { db: Database } => ({ db: db as unknown as Database });

const TABLES = ["students", "checkpoints", "scans"];

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  mockEventActive = true;
  isEventActiveMock.mockClear();
  await client.exec(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
});

// Helper creators to speed up test setup
async function createStudent(studentId: string, email: string) {
  const [student] = await db
    .insert(schema.students)
    .values({
      studentId,
      email,
      firstName: "Som",
      lastName: "Chai",
      role: "student"
    })
    .returning();
  return student;
}

async function createCheckpoint(
  game: "jigsaw" | "csr",
  code: string,
  lat: number | null,
  lng: number | null,
  geofenceRadiusM: number = 30
) {
  const [checkpoint] = await db
    .insert(schema.checkpoints)
    .values({ game, code, lat, lng, geofenceRadiusM })
    .returning();
  return checkpoint;
}

// Chulalongkorn University main gate — reference point used across tests.
const CHECKPOINT_LAT = 13.7367;
const CHECKPOINT_LNG = 100.533;

describe("GamesService.getProgress", () => {
  it("rejects an invalid game type", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");

    await expect(
      GamesService.getProgress("6900000001", "walkrally", injected())
    ).rejects.toMatchObject({ code: "INVALID_GAME_TYPE" });
  });

  it("rejects if the student can't be resolved", async () => {
    await expect(
      GamesService.getProgress("6900000099", "jigsaw", injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns an empty list when nothing has been collected yet", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");

    const result = await GamesService.getProgress("6900000001", "jigsaw", injected());
    expect(result.collected).toHaveLength(0);
  });

  it("returns collected checkpoints across both games, regardless of the :gameType requested", async () => {
    const student = await createStudent("6900000001", "s1@student.chula.ac.th");
    const jig = await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, CHECKPOINT_LNG);
    const csr = await createCheckpoint("csr", "CSR-01", CHECKPOINT_LAT, CHECKPOINT_LNG);
    await db.insert(schema.scans).values([
      { checkpointId: jig.id, studentId: student.id, lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
      { checkpointId: csr.id, studentId: student.id, lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG }
    ]);

    // Requesting through the "jigsaw" URL segment still returns the CSR scan too.
    const result = await GamesService.getProgress("6900000001", "jigsaw", injected());
    expect(result.collected).toHaveLength(2);
    expect(result.collected.map((c) => c.code).sort()).toEqual(["CSR-01", "JIG-01"]);
  });

  it("only returns the requesting student's own scans", async () => {
    const student = await createStudent("6900000001", "s1@student.chula.ac.th");
    await createStudent("6900000002", "s2@student.chula.ac.th");
    const jig = await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, CHECKPOINT_LNG);
    await db
      .insert(schema.scans)
      .values({
        checkpointId: jig.id,
        studentId: student.id,
        lat: CHECKPOINT_LAT,
        lng: CHECKPOINT_LNG
      });

    const result = await GamesService.getProgress("6900000002", "jigsaw", injected());
    expect(result.collected).toHaveLength(0);
  });
});

describe("GamesService.collectCheckpoint", () => {
  it("rejects an invalid game type", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");

    await expect(
      GamesService.collectCheckpoint(
        "6900000001",
        "walkrally",
        { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
        injected()
      )
    ).rejects.toMatchObject({ code: "INVALID_GAME_TYPE" });
  });

  it("rejects when the game window is closed", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, CHECKPOINT_LNG);
    mockEventActive = false;

    await expect(
      GamesService.collectCheckpoint(
        "6900000001",
        "jigsaw",
        { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
        injected()
      )
    ).rejects.toMatchObject({ code: "GAME_CLOSED" });
  });

  it("rejects an unknown checkpoint code", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");

    await expect(
      GamesService.collectCheckpoint(
        "6900000001",
        "jigsaw",
        { code: "NOPE", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
        injected()
      )
    ).rejects.toMatchObject({ code: "INVALID_CHECKPOINT" });
  });

  it("rejects a code that belongs to a different game", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createCheckpoint("csr", "CSR-01", CHECKPOINT_LAT, CHECKPOINT_LNG);

    // CSR-01 exists, but not under the "jigsaw" game.
    await expect(
      GamesService.collectCheckpoint(
        "6900000001",
        "jigsaw",
        { code: "CSR-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
        injected()
      )
    ).rejects.toMatchObject({ code: "INVALID_CHECKPOINT" });
  });

  it("rejects a scan outside the checkpoint's geofence radius", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, CHECKPOINT_LNG, 30);

    // ~1km away, well outside a 30m radius.
    await expect(
      GamesService.collectCheckpoint(
        "6900000001",
        "jigsaw",
        { code: "JIG-01", lat: CHECKPOINT_LAT + 0.01, lng: CHECKPOINT_LNG + 0.01 },
        injected()
      )
    ).rejects.toMatchObject({ code: "OUT_OF_GEOFENCE" });
  });

  it("skips the geofence check for checkpoints with no coordinates yet", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    // lat/lng still null — real coordinates pending from ISD-45.
    await createCheckpoint("jigsaw", "JIG-01", null, null);

    const result = await GamesService.collectCheckpoint(
      "6900000001",
      "jigsaw",
      { code: "JIG-01", lat: 0, lng: 0 },
      injected()
    );
    expect(result.code).toBe("JIG-01");
  });

  it("collects a checkpoint inside the geofence", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    const checkpoint = await createCheckpoint(
      "jigsaw",
      "JIG-01",
      CHECKPOINT_LAT,
      CHECKPOINT_LNG,
      30
    );

    const result = await GamesService.collectCheckpoint(
      "6900000001",
      "jigsaw",
      { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
      injected()
    );
    expect(result.checkpointId).toBe(checkpoint.id);
    expect(result.code).toBe("JIG-01");
    expect(result.scannedAt).toBeInstanceOf(Date);
  });

  it("rejects collecting the same checkpoint twice", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, CHECKPOINT_LNG, 30);

    await GamesService.collectCheckpoint(
      "6900000001",
      "jigsaw",
      { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
      injected()
    );

    await expect(
      GamesService.collectCheckpoint(
        "6900000001",
        "jigsaw",
        { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
        injected()
      )
    ).rejects.toMatchObject({ code: "ALREADY_COLLECTED" });
  });

  it("lets different students collect the same checkpoint independently", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createStudent("6900000002", "s2@student.chula.ac.th");
    await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, CHECKPOINT_LNG, 30);

    await GamesService.collectCheckpoint(
      "6900000001",
      "jigsaw",
      { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
      injected()
    );
    const result = await GamesService.collectCheckpoint(
      "6900000002",
      "jigsaw",
      { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
      injected()
    );
    expect(result.code).toBe("JIG-01");
  });
});

describe("GamesService.collectCheckpoint — edge cases", () => {
  // 1 degree of latitude is ~111,194.9m everywhere on a sphere of the
  // service's EARTH_RADIUS_M (6,371,000m) — a well-known fact independent
  // of the service's own haversine implementation, used here to pick scan
  // points a known distance from the checkpoint without duplicating that
  // formula in the test.
  const ONE_MILLI_DEGREE_LAT_METERS = 111.1949;

  it("allows a scan just inside the geofence boundary", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    // checkpoint 0.001 degrees south of the scan point -> ~111.19m away.
    await createCheckpoint(
      "jigsaw",
      "JIG-01",
      CHECKPOINT_LAT - 0.001,
      CHECKPOINT_LNG,
      Math.ceil(ONE_MILLI_DEGREE_LAT_METERS)
    );

    const result = await GamesService.collectCheckpoint(
      "6900000001",
      "jigsaw",
      { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
      injected()
    );
    expect(result.code).toBe("JIG-01");
  });

  it("rejects a scan just outside the geofence boundary", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    // Same ~111.19m distance as above, but the radius is now 1m short of it.
    await createCheckpoint(
      "jigsaw",
      "JIG-01",
      CHECKPOINT_LAT - 0.001,
      CHECKPOINT_LNG,
      Math.floor(ONE_MILLI_DEGREE_LAT_METERS)
    );

    await expect(
      GamesService.collectCheckpoint(
        "6900000001",
        "jigsaw",
        { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
        injected()
      )
    ).rejects.toMatchObject({ code: "OUT_OF_GEOFENCE" });
  });

  it("skips the geofence check when only one of lat/lng is set", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    // lat set, lng still null — treated the same as "no coordinates yet".
    await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, null, 30);

    const result = await GamesService.collectCheckpoint(
      "6900000001",
      "jigsaw",
      { code: "JIG-01", lat: 0, lng: 0 }, // nowhere near CHECKPOINT_LAT/LNG
      injected()
    );
    expect(result.code).toBe("JIG-01");
  });

  it("only lets one of two concurrent collect attempts for the same checkpoint succeed", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, CHECKPOINT_LNG, 30);

    const attempt = () =>
      GamesService.collectCheckpoint(
        "6900000001",
        "jigsaw",
        { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
        injected()
      );

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "ALREADY_COLLECTED"
    });

    // Exactly one scan row was actually written, not zero or two.
    const rows = await db.select().from(schema.scans);
    expect(rows).toHaveLength(1);
  });

  it("checks jigsaw collection against the rpkm_jigsaw window, not rpkm_csr", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createCheckpoint("jigsaw", "JIG-01", CHECKPOINT_LAT, CHECKPOINT_LNG, 30);

    await GamesService.collectCheckpoint(
      "6900000001",
      "jigsaw",
      { code: "JIG-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
      injected()
    );

    expect(isEventActiveMock).toHaveBeenLastCalledWith("rpkm_jigsaw");
  });

  it("checks csr collection against the rpkm_csr window, not rpkm_jigsaw", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createCheckpoint("csr", "CSR-01", CHECKPOINT_LAT, CHECKPOINT_LNG, 30);

    await GamesService.collectCheckpoint(
      "6900000001",
      "csr",
      { code: "CSR-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
      injected()
    );

    expect(isEventActiveMock).toHaveBeenLastCalledWith("rpkm_csr");
  });

  it("rejects CSR collection when the CSR game window is closed", async () => {
    await createStudent("6900000001", "s1@student.chula.ac.th");
    await createCheckpoint("csr", "CSR-01", CHECKPOINT_LAT, CHECKPOINT_LNG, 30);
    mockEventActive = false;

    await expect(
      GamesService.collectCheckpoint(
        "6900000001",
        "csr",
        { code: "CSR-01", lat: CHECKPOINT_LAT, lng: CHECKPOINT_LNG },
        injected()
      )
    ).rejects.toMatchObject({ code: "GAME_CLOSED" });
  });
});
