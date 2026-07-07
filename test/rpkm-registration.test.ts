import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { RpkmRegistrationService } from "../src/services/rpkm-registration.service";

const { registerRpkm, getMe, generateJoinCode } = RpkmRegistrationService;

// Real Postgres (pglite, in-memory WASM) with the generated migrations applied,
// so these exercise the actual constraints + transactions. The service takes an
// injected db.
let client: PGlite;
let db: PgliteDatabase<typeof schema>;
const injected = (): { db: Database } => ({ db: db as unknown as Database });

const TABLES = [
  "students",
  "registrations",
  "travel_legs",
  "entries",
  "checkpoints",
  "scans",
  "houses",
  "groups",
  "group_house_choices"
];

type AuthUser = { id: string; email: string; name: string };
const authUser = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: "auth-user-1",
  email: "6912345678@student.chula.ac.th",
  name: "Somchai Jaidee",
  ...over
});

const leg = (over: Record<string, unknown> = {}) => ({
  vehicle: "bus" as const,
  originDistrict: "Mueang",
  originProvince: "Chiang Mai",
  destinationDistrict: "Bang Khen",
  destinationProvince: "Bangkok",
  ...over
});

// A valid minimal registration — travelLegs are required now (1..4).
const validInput = (over: Record<string, unknown> = {}) => ({
  pdpaConsent: true,
  travelLegs: [leg()],
  ...over
});

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
});

describe("registerRpkm — happy path", () => {
  it("creates student + registration + solo group and returns them", async () => {
    const result = await registerRpkm(authUser(), validInput(), injected());

    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.registrationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.group.leaderId).toBe(result.userId);
    expect(result.group.assignedHouseId).toBeNull();
    expect(result.group.joinCode).toMatch(/^[A-Z0-9]{6}$/);

    const [student] = await db.select().from(schema.students);
    expect(student.studentId).toBe("6912345678"); // derived from the email local-part

    const [registration] = await db.select().from(schema.registrations);
    expect(registration.project).toBe("rpkm");
    expect(registration.groupId).toBe(result.group.id);
  });

  it("maps pno_aware to students and pno_source to registrations", async () => {
    await registerRpkm(
      authUser(),
      validInput({ pnoSgcuAwareness: "instagram", pnoReferralSource: "friend" }),
      injected()
    );
    const [student] = await db.select().from(schema.students);
    const [registration] = await db.select().from(schema.registrations);
    expect(student.pnoSgcuAwareness).toBe("instagram");
    expect(registration.pnoReferralSource).toBe("friend");
  });

  it("uses profile fields from the payload (not the SSO name), keeping studentId from auth", async () => {
    await registerRpkm(
      authUser({ name: "Somchai Jaidee" }),
      validInput({
        firstName: "ก้อง",
        lastName: "ทดสอบ",
        prefix: "mr",
        nickname: "Kong",
        phone: "0812345678",
        allergies: "peanuts"
      }),
      injected()
    );
    const [student] = await db.select().from(schema.students);
    expect(student.firstName).toBe("ก้อง"); // payload wins over "Somchai"
    expect(student.lastName).toBe("ทดสอบ");
    expect(student.prefix).toBe("mr");
    expect(student.nickname).toBe("Kong");
    expect(student.phone).toBe("0812345678");
    expect(student.allergies).toBe("peanuts");
    expect(student.studentId).toBe("6912345678"); // still derived from auth email
  });
});

describe("registerRpkm — travel legs", () => {
  it("forces the 4th leg's destination on a full 4-leg journey", async () => {
    const result = await registerRpkm(
      authUser(),
      validInput({
        travelLegs: [
          leg({ destinationDistrict: "A", destinationProvince: "PA" }),
          leg({ destinationDistrict: "B", destinationProvince: "PB" }),
          leg({ destinationDistrict: "C", destinationProvince: "PC" }),
          leg({ destinationDistrict: "Somewhere", destinationProvince: "Nowhere" })
        ]
      }),
      injected()
    );
    const rows = await db
      .select()
      .from(schema.travelLegs)
      .where(eq(schema.travelLegs.registrationId, result.registrationId))
      .orderBy(schema.travelLegs.seq);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    expect(rows[2].destinationDistrict).toBe("C"); // leg 3 kept
    expect(rows[3].destinationDistrict).toBe("Pathum Wan"); // leg 4 forced
    expect(rows[3].destinationProvince).toBe("Bangkok");
  });

  it("does NOT force the destination on a shorter journey", async () => {
    const result = await registerRpkm(
      authUser(),
      validInput({
        travelLegs: [
          leg(),
          leg({ destinationDistrict: "Don Mueang", destinationProvince: "Bangkok" })
        ]
      }),
      injected()
    );
    const rows = await db
      .select()
      .from(schema.travelLegs)
      .where(eq(schema.travelLegs.registrationId, result.registrationId))
      .orderBy(schema.travelLegs.seq);
    expect(rows[1].destinationDistrict).toBe("Don Mueang"); // kept, not overwritten
  });

  it("normalizes vehicleOther to null when vehicle is not 'other'", async () => {
    const result = await registerRpkm(
      authUser(),
      validInput({ travelLegs: [leg({ vehicle: "bus", vehicleOther: "should-be-dropped" })] }),
      injected()
    );
    const [row] = await db
      .select()
      .from(schema.travelLegs)
      .where(eq(schema.travelLegs.registrationId, result.registrationId));
    expect(row.vehicleOther).toBeNull();
  });

  it("keeps vehicleOther when vehicle is 'other'", async () => {
    const result = await registerRpkm(
      authUser(),
      validInput({ travelLegs: [leg({ vehicle: "other", vehicleOther: "Songthaew" })] }),
      injected()
    );
    const [row] = await db
      .select()
      .from(schema.travelLegs)
      .where(eq(schema.travelLegs.registrationId, result.registrationId));
    expect(row.vehicle).toBe("other");
    expect(row.vehicleOther).toBe("Songthaew");
  });
});

describe("registerRpkm — validation", () => {
  it("rejects when pdpaConsent is not true (PDPA_REQUIRED)", async () => {
    await expect(
      registerRpkm(authUser(), validInput({ pdpaConsent: false }), injected())
    ).rejects.toMatchObject({ code: "PDPA_REQUIRED" });
    expect(await db.select().from(schema.students)).toHaveLength(0);
  });

  it("rejects zero travel legs", async () => {
    await expect(
      registerRpkm(authUser(), { pdpaConsent: true, travelLegs: [] }, injected())
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects more than 4 travel legs", async () => {
    await expect(
      registerRpkm(
        authUser(),
        validInput({ travelLegs: [leg(), leg(), leg(), leg(), leg()] }),
        injected()
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects vehicle 'other' without vehicleOther", async () => {
    await expect(
      registerRpkm(authUser(), validInput({ travelLegs: [leg({ vehicle: "other" })] }), injected())
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("registerRpkm — insert-only (no duplicate registration)", () => {
  it("rejects a second registration for the same project (ALREADY_REGISTERED)", async () => {
    await registerRpkm(authUser(), validInput(), injected());

    await expect(registerRpkm(authUser(), validInput(), injected())).rejects.toMatchObject({
      code: "ALREADY_REGISTERED"
    });

    // state unchanged: still one registration + one group
    expect(await db.select().from(schema.registrations)).toHaveLength(1);
    expect(await db.select().from(schema.groups)).toHaveLength(1);
  });
});

describe("registerRpkm — join code", () => {
  it("generates a 6-char A-Z/0-9 code", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateJoinCode()).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it("retries until it finds an unused code on collision", async () => {
    const [leader] = await db
      .insert(schema.students)
      .values({
        studentId: "6900000000",
        email: "leader@student.chula.ac.th",
        firstName: "A",
        lastName: "B"
      })
      .returning();
    await db.insert(schema.groups).values({ leaderId: leader.id, joinCode: "AAAAAA" });

    let calls = 0;
    const genCode = () => (calls++ === 0 ? "AAAAAA" : "BBBBBB");

    const result = await registerRpkm(authUser(), validInput(), { ...injected(), genCode });
    expect(calls).toBe(2);
    expect(result.group.joinCode).toBe("BBBBBB");
  });

  it("rolls the whole transaction back when a unique code can't be found", async () => {
    const [leader] = await db
      .insert(schema.students)
      .values({
        studentId: "6900000000",
        email: "leader@student.chula.ac.th",
        firstName: "A",
        lastName: "B"
      })
      .returning();
    await db.insert(schema.groups).values({ leaderId: leader.id, joinCode: "AAAAAA" });

    const genCode = () => "AAAAAA";

    await expect(
      registerRpkm(authUser(), validInput(), { ...injected(), genCode })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    const students = await db.select().from(schema.students);
    expect(students).toHaveLength(1); // only the seeded leader
    expect(await db.select().from(schema.registrations)).toHaveLength(0);
  });
});

describe("registerRpkm — freshman only", () => {
  it("rejects a non-freshman (student_id not starting with 69) with NOT_FRESHMEN", async () => {
    await expect(
      registerRpkm(authUser({ email: "6612345678@student.chula.ac.th" }), validInput(), injected())
    ).rejects.toMatchObject({ code: "NOT_FRESHMEN" });
    expect(await db.select().from(schema.students)).toHaveLength(0);
  });

  it("getMe rejects a non-freshman with NOT_FRESHMEN", async () => {
    await expect(
      getMe(authUser({ email: "6612345678@student.chula.ac.th" }), injected())
    ).rejects.toMatchObject({ code: "NOT_FRESHMEN" });
  });
});

describe("getMe", () => {
  it("returns the saved data with pnoSgcuAwareness + profile on the user object", async () => {
    await registerRpkm(
      authUser(),
      validInput({
        firstName: "ก้อง",
        nickname: "Kong",
        pnoSgcuAwareness: "instagram",
        pnoReferralSource: "friend"
      }),
      injected()
    );

    const me = await getMe(authUser(), injected());
    expect(me.user.studentCode).toBe("6912345678");
    expect(me.user.firstName).toBe("ก้อง");
    expect(me.user.nickname).toBe("Kong");
    expect(me.user.pnoSgcuAwareness).toBe("instagram"); // on user, not registration
    expect(me.registration?.pdpaConsent).toBe(true);
    expect(me.registration?.pnoReferralSource).toBe("friend");
    expect(me.travelLegs).toHaveLength(1);
    expect(me.group?.leaderId).toBe(me.user.id!);
  });

  it("returns a stable empty shape (id/profile null) for a never-registered user", async () => {
    const me = await getMe(authUser(), injected());
    expect(me.user.id).toBeNull();
    expect(me.user.studentCode).toBe("6912345678");
    expect(me.user.pnoSgcuAwareness).toBeNull();
    expect(me.user.nickname).toBeNull();
    expect(me.registration).toBeNull();
    expect(me.travelLegs).toEqual([]);
    expect(me.group).toBeNull();
  });
});
