import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { RpkmRegistrationService } from "../src/services/rpkm-registration.service";

const { registerRpkm, getMe, generateJoinCode, RpkmRegistrationServiceError } =
  RpkmRegistrationService;

// Real Postgres (pglite, in-memory WASM) with the generated migrations applied,
// so these exercise the actual constraints + transactions, not just the types.
// The service takes an injected `db`; we hand it this migrated instance.
let client: PGlite;
let db: PgliteDatabase<typeof schema>;
// The service takes `deps: { db?, genCode? }`; hand it the migrated pglite
// instance. It's typed as the app's node-postgres `Database` but is
// structurally the same surface, so cast at this one seam.
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
    const result = await registerRpkm(authUser(), { pdpaConsent: true }, injected());

    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.registrationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.group.leaderId).toBe(result.userId);
    expect(result.group.assignedHouseId).toBeNull();
    expect(result.group.joinCode).toMatch(/^[A-Z0-9]{6}$/);

    const [student] = await db.select().from(schema.students);
    expect(student.studentId).toBe("6912345678"); // derived from the email local-part
    expect(student.email).toBe("6912345678@student.chula.ac.th");
    expect(student.firstName).toBe("Somchai");
    expect(student.lastName).toBe("Jaidee");

    const [registration] = await db.select().from(schema.registrations);
    expect(registration.project).toBe("rpkm");
    expect(registration.pdpaAcceptedAt).toBeInstanceOf(Date);
    expect(registration.groupId).toBe(result.group.id);
  });

  it("maps pno_aware to students and pno_source to registrations", async () => {
    await registerRpkm(
      authUser(),
      { pdpaConsent: true, pnoSgcuAwareness: "instagram", pnoReferralSource: "friend" },
      injected()
    );

    const [student] = await db.select().from(schema.students);
    const [registration] = await db.select().from(schema.registrations);
    expect(student.pnoSgcuAwareness).toBe("instagram");
    expect(registration.pnoReferralSource).toBe("friend");
    // must NOT be swapped across tables
    expect(registration.pnoReferralSource).not.toBe("instagram");
  });
});

describe("registerRpkm — travel legs", () => {
  it("saves legs and forces the LAST leg's destination to Pathum Wan / Bangkok", async () => {
    const result = await registerRpkm(
      authUser(),
      {
        pdpaConsent: true,
        travelLegs: [
          leg({ destinationDistrict: "Bang Khen", destinationProvince: "Bangkok" }),
          // frontend sends a bogus final destination — server must override it
          leg({ destinationDistrict: "Somewhere", destinationProvince: "Nowhere" })
        ]
      },
      injected()
    );

    const rows = await db
      .select()
      .from(schema.travelLegs)
      .where(eq(schema.travelLegs.registrationId, result.registrationId))
      .orderBy(schema.travelLegs.seq);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(rows[1].destinationDistrict).toBe("Pathum Wan");
    expect(rows[1].destinationProvince).toBe("Bangkok");
  });

  it("overrides the destination even for a single leg", async () => {
    const result = await registerRpkm(
      authUser(),
      {
        pdpaConsent: true,
        travelLegs: [leg({ destinationDistrict: "X", destinationProvince: "Y" })]
      },
      injected()
    );
    const [row] = await db
      .select()
      .from(schema.travelLegs)
      .where(eq(schema.travelLegs.registrationId, result.registrationId));
    expect(row.destinationDistrict).toBe("Pathum Wan");
    expect(row.destinationProvince).toBe("Bangkok");
  });

  it("normalizes vehicleOther to null when vehicle is not 'other'", async () => {
    const result = await registerRpkm(
      authUser(),
      {
        pdpaConsent: true,
        travelLegs: [leg({ vehicle: "bus", vehicleOther: "should-be-dropped" })]
      },
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
      { pdpaConsent: true, travelLegs: [leg({ vehicle: "other", vehicleOther: "Songthaew" })] },
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
  it("rejects when pdpaConsent is not true", async () => {
    await expect(registerRpkm(authUser(), { pdpaConsent: false }, injected())).rejects.toThrow(
      RpkmRegistrationServiceError
    );
    expect(await db.select().from(schema.students)).toHaveLength(0);
  });

  it("rejects more than 2 travel legs", async () => {
    await expect(
      registerRpkm(authUser(), { pdpaConsent: true, travelLegs: [leg(), leg(), leg()] }, injected())
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects vehicle 'other' without vehicleOther", async () => {
    await expect(
      registerRpkm(
        authUser(),
        { pdpaConsent: true, travelLegs: [leg({ vehicle: "other" })] },
        injected()
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("registerRpkm — join code", () => {
  it("generates a 6-char A-Z/0-9 code", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateJoinCode()).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it("retries until it finds an unused code on collision", async () => {
    // Seed a group that already owns "AAAAAA".
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

    const result = await registerRpkm(
      authUser(),
      { pdpaConsent: true },
      { ...injected(), genCode }
    );
    expect(calls).toBe(2); // first candidate clashed, retried once
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

    const genCode = () => "AAAAAA"; // always collides → exhausts retries

    await expect(
      registerRpkm(authUser(), { pdpaConsent: true }, { ...injected(), genCode })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    // The would-be new student/registration must have been rolled back.
    const students = await db.select().from(schema.students);
    expect(students).toHaveLength(1); // only the seeded leader
    expect(students[0].studentId).toBe("6900000000");
    const regs = await db.select().from(schema.registrations);
    expect(regs).toHaveLength(0);
  });
});

describe("registerRpkm — resubmit", () => {
  it("updates the existing registration and reuses the same solo group", async () => {
    const first = await registerRpkm(
      authUser(),
      { pdpaConsent: true, pnoReferralSource: "friend", travelLegs: [leg()] },
      injected()
    );

    const second = await registerRpkm(
      authUser(),
      { pdpaConsent: true, pnoReferralSource: "instagram", travelLegs: [leg(), leg()] },
      injected()
    );

    expect(second.userId).toBe(first.userId);
    expect(second.registrationId).toBe(first.registrationId);
    expect(second.group.id).toBe(first.group.id); // group reused, not recreated

    expect(await db.select().from(schema.students)).toHaveLength(1);
    expect(await db.select().from(schema.groups)).toHaveLength(1);

    const [registration] = await db.select().from(schema.registrations);
    expect(registration.pnoReferralSource).toBe("instagram"); // updated

    const legs = await db
      .select()
      .from(schema.travelLegs)
      .where(eq(schema.travelLegs.registrationId, second.registrationId));
    expect(legs).toHaveLength(2); // legs replaced wholesale (was 1, now 2)
  });

  it("preserves survey answers and legs when a resubmit omits those fields", async () => {
    await registerRpkm(
      authUser(),
      {
        pdpaConsent: true,
        pnoSgcuAwareness: "instagram",
        pnoReferralSource: "friend",
        travelLegs: [leg()]
      },
      injected()
    );

    // Resubmit with ONLY pdpaConsent — survey fields + travelLegs omitted.
    await registerRpkm(authUser(), { pdpaConsent: true }, injected());

    const [student] = await db.select().from(schema.students);
    const [registration] = await db.select().from(schema.registrations);
    expect(student.pnoSgcuAwareness).toBe("instagram"); // NOT wiped
    expect(registration.pnoReferralSource).toBe("friend"); // NOT wiped
    const legs = await db.select().from(schema.travelLegs);
    expect(legs).toHaveLength(1); // legs NOT wiped
  });

  it("clears legs when a resubmit sends an explicit empty array", async () => {
    await registerRpkm(authUser(), { pdpaConsent: true, travelLegs: [leg()] }, injected());
    await registerRpkm(authUser(), { pdpaConsent: true, travelLegs: [] }, injected());
    expect(await db.select().from(schema.travelLegs)).toHaveLength(0);
  });

  it("clears a survey answer when a resubmit sends an explicit null", async () => {
    await registerRpkm(
      authUser(),
      { pdpaConsent: true, pnoSgcuAwareness: "instagram" },
      injected()
    );
    await registerRpkm(authUser(), { pdpaConsent: true, pnoSgcuAwareness: null }, injected());
    const [student] = await db.select().from(schema.students);
    expect(student.pnoSgcuAwareness).toBeNull();
  });
});

describe("getMe", () => {
  it("returns the saved data after registering", async () => {
    await registerRpkm(
      authUser(),
      {
        pdpaConsent: true,
        pnoSgcuAwareness: "instagram",
        pnoReferralSource: "friend",
        travelLegs: [leg()]
      },
      injected()
    );

    const me = await getMe(authUser(), injected());
    expect(me.user.studentCode).toBe("6912345678");
    expect(me.user.firstName).toBe("Somchai");
    expect(me.registration).not.toBeNull();
    expect(me.registration?.pdpaConsent).toBe(true);
    expect(me.registration?.pnoSgcuAwareness).toBe("instagram");
    expect(me.registration?.pnoReferralSource).toBe("friend");
    expect(me.travelLegs).toHaveLength(1);
    expect(me.travelLegs[0].destinationDistrict).toBe("Pathum Wan");
    expect(me.group).not.toBeNull();
    expect(me.user.id).toMatch(/^[0-9a-f-]{36}$/); // students uuid, not the Better Auth id
    expect(me.group?.leaderId).toBe(me.user.id!);
  });

  it("returns a stable empty shape (id null) for a never-registered user", async () => {
    const me = await getMe(authUser(), injected());
    expect(me.user.id).toBeNull(); // no students row yet — not the Better Auth id
    expect(me.user.studentCode).toBe("6912345678");
    expect(me.user.firstName).toBe("Somchai");
    expect(me.registration).toBeNull();
    expect(me.travelLegs).toEqual([]);
    expect(me.group).toBeNull();
  });
});
