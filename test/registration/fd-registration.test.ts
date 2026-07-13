import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../../src/db";
import * as schema from "../../src/db/schema";
import { FirstDateService } from "../../src/services/firstdate.service";
import { RpkmService } from "../../src/services/rpkm.service";

const { registerFd, getMe, getProfile } = FirstDateService;

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

const validInput = (over: Record<string, unknown> = {}) => ({
  pdpaConsent: true,
  csoDistrict: "Suthep",
  csoProvince: "Chiang Mai",
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

describe("registerFd — happy path", () => {
  it("creates student + firstdate registration with NO group (group_id null)", async () => {
    const result = await registerFd(authUser(), validInput(), injected());

    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.registrationId).toMatch(/^[0-9a-f-]{36}$/);
    expect("group" in result).toBe(false); // FD result carries no group field

    const [registration] = await db.select().from(schema.registrations);
    expect(registration.project).toBe("firstdate");
    expect(registration.groupId).toBeNull();
    expect(await db.select().from(schema.groups)).toHaveLength(0);
  });

  it("maps pno_aware to students and pno_source to registrations", async () => {
    await registerFd(
      authUser(),
      validInput({ pnoSgcuAwareness: "instagram", pnoReferralSource: "friend" }),
      injected()
    );
    const [student] = await db.select().from(schema.students);
    const [registration] = await db.select().from(schema.registrations);
    expect(student.pnoSgcuAwareness).toBe("instagram");
    expect(registration.pnoReferralSource).toBe("friend");
  });

  it("uses profile fields from the payload (not the SSO name)", async () => {
    await registerFd(
      authUser({ name: "Somchai Jaidee" }),
      validInput({ firstName: "ก้อง", lastName: "ทดสอบ", prefix: "mr" }),
      injected()
    );
    const [student] = await db.select().from(schema.students);
    expect(student.firstName).toBe("ก้อง");
    expect(student.prefix).toBe("mr");
    expect(student.studentId).toBe("6912345678");
  });
});

describe("registerFd — travel legs", () => {
  it("forces the 4th leg's destination only on a full 4-leg journey", async () => {
    const result = await registerFd(
      authUser(),
      validInput({
        travelLegs: [
          leg(),
          leg(),
          leg(),
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
    expect(rows).toHaveLength(4);
    expect(rows[3].destinationDistrict).toBe("Pathum Wan");
    expect(rows[3].destinationProvince).toBe("Bangkok");
  });

  it("keeps the destination for a shorter journey", async () => {
    const result = await registerFd(
      authUser(),
      validInput({ travelLegs: [leg({ destinationDistrict: "Don Mueang" })] }),
      injected()
    );
    const [row] = await db
      .select()
      .from(schema.travelLegs)
      .where(eq(schema.travelLegs.registrationId, result.registrationId));
    expect(row.destinationDistrict).toBe("Don Mueang");
  });
});

describe("registerFd — validation", () => {
  it("rejects when pdpaConsent is not true (PDPA_REQUIRED)", async () => {
    await expect(
      registerFd(authUser(), validInput({ pdpaConsent: false }), injected())
    ).rejects.toMatchObject({ code: "PDPA_REQUIRED" });
    expect(await db.select().from(schema.students)).toHaveLength(0);
  });

  it("rejects zero travel legs", async () => {
    await expect(
      registerFd(authUser(), { pdpaConsent: true, travelLegs: [] }, injected())
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects more than 4 travel legs", async () => {
    await expect(
      registerFd(
        authUser(),
        validInput({ travelLegs: [leg(), leg(), leg(), leg(), leg()] }),
        injected()
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("registerFd — insert-only", () => {
  it("rejects a second FirstDate registration (ALREADY_REGISTERED)", async () => {
    await registerFd(authUser(), validInput(), injected());
    await expect(registerFd(authUser(), validInput(), injected())).rejects.toMatchObject({
      code: "ALREADY_REGISTERED"
    });
    expect(await db.select().from(schema.registrations)).toHaveLength(1);
  });
});

describe("registerFd — access control", () => {
  it("rejects non-freshmen registration", async () => {
    await expect(
      registerFd(authUser({ email: "6612345678@student.chula.ac.th" }), validInput(), injected())
    ).rejects.toMatchObject({ code: "NOT_FRESHMEN" });
    expect(await db.select().from(schema.registrations)).toHaveLength(0);
  });

  it("prevent pre-seeded staff from registering", async () => {
    // Seed a staff user
    await db.insert(schema.students).values({
      studentId: "staffuser",
      email: "staffuser@student.chula.ac.th",
      firstName: "Staff",
      lastName: "Member",
      role: "staff"
    });

    await expect(
      registerFd(authUser({ email: "staffuser@student.chula.ac.th" }), validInput(), injected())
    ).rejects.toMatchObject({ code: "NOT_FRESHMEN" });
  });

  it("allows non-freshman to call getProfile", async () => {
    const me = await getProfile(authUser({ email: "6612345678@student.chula.ac.th" }), injected());
    expect(me.user.id).toBeNull();
  });
});

describe("getProfile (FirstDate)", () => {
  it("returns saved data with pnoSgcuAwareness on user and no group field", async () => {
    await registerFd(authUser(), validInput({ pnoSgcuAwareness: "instagram" }), injected());
    const me = await getProfile(authUser(), injected());
    expect(me.user.studentId).toBe("6912345678");
    expect(me.user.pnoSgcuAwareness).toBe("instagram");
    expect(me.user.csoDistrict).toBe("Suthep");
    expect(me.user.csoProvince).toBe("Chiang Mai");
    expect(me.user.bottle).toBeNull(); // not sent in registrationBody, defaults null
    expect(me.registration?.pdpaConsent).toBe(true);
    expect(me.travelLegs).toHaveLength(1);
    expect("group" in me).toBe(false);
  });

  it("returns a stable empty shape (id null) for a never-registered user", async () => {
    const me = await getProfile(authUser(), injected());
    expect(me.user.id).toBeNull();
    expect(me.user.pnoSgcuAwareness).toBeNull();
    expect(me.user.csoDistrict).toBeNull();
    expect(me.user.csoProvince).toBeNull();
    expect(me.user.bottle).toBeNull();
    expect(me.registration).toBeNull();
    expect(me.travelLegs).toEqual([]);
  });
});

describe("getMe (FirstDate) - debloated", () => {
  it("returns debloated user info if registered", async () => {
    const regResult = await registerFd(authUser(), validInput(), injected());
    const me = await getMe(authUser(), injected());
    expect(me).toEqual({
      id: regResult.userId,
      studentId: "6912345678",
      firstName: "Somchai",
      lastName: "Jaidee",
      faculty: null,
      role: "student",
      registered: true
    });
  });

  it("returns debloated user info if not registered", async () => {
    const me = await getMe(authUser(), injected());
    expect(me).toEqual({
      id: null,
      studentId: "6912345678",
      firstName: "Somchai",
      lastName: "Jaidee",
      faculty: null,
      role: "student",
      registered: false
    });
  });

  it("throws NOT_FRESHMEN for non-freshman when student record is absent", async () => {
    await expect(
      getMe(authUser({ email: "6612345678@student.chula.ac.th" }), injected())
    ).rejects.toMatchObject({ code: "NOT_FRESHMEN" });
  });
});

describe("FirstDate + RPKM share one student, separate registrations", () => {
  it("lets the same person register for both projects independently", async () => {
    const fd = await registerFd(authUser(), validInput(), injected());
    const rpkm = await RpkmService.registerRpkm(authUser(), validInput(), injected());

    expect(await db.select().from(schema.students)).toHaveLength(1); // one shared student
    expect(rpkm.userId).toBe(fd.userId);

    const regs = await db.select().from(schema.registrations);
    expect(regs).toHaveLength(2); // one per project

    const [fdReg] = await db
      .select()
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.id, fd.registrationId),
          eq(schema.registrations.project, "firstdate")
        )
      );
    expect(fdReg.groupId).toBeNull(); // FD: no group

    const [rpkmReg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, rpkm.registrationId));
    expect(rpkmReg.groupId).toBe(rpkm.group.id); // RPKM: solo group

    expect(await db.select().from(schema.groups)).toHaveLength(1); // only the RPKM one
  });
});

describe("updateProfile (FirstDate)", () => {
  it("successfully updates student fields and replaces travel legs", async () => {
    await registerFd(authUser(), validInput(), injected());

    const updatePayload = validInput({
      nickname: "NewNick",
      faculty: "Engineering",
      allergies: "peanuts",
      dietary: "vegan",
      medicalNotes: "asthma",
      travelLegs: [
        leg({ originDistrict: "Bang Kruai", originProvince: "Nonthaburi" }),
        leg({ originDistrict: "Sathon", originProvince: "Bangkok" })
      ]
    });

    const profile = await FirstDateService.updateProfile(authUser(), updatePayload, injected());
    expect(profile.user.nickname).toBe("NewNick");
    expect(profile.user.faculty).toBe("Engineering");
    expect(profile.user.allergies).toBe("peanuts");
    expect(profile.user.dietary).toBe("vegan");
    expect(profile.user.medicalNotes).toBe("asthma");
    expect(profile.travelLegs).toHaveLength(2);
    expect(profile.travelLegs[0].originDistrict).toBe("Bang Kruai");
    expect(profile.travelLegs[1].originDistrict).toBe("Sathon");
  });

  it("successfully performs partial update without changing travel legs", async () => {
    await registerFd(authUser(), validInput(), injected());

    const partialPayload = {
      nickname: "PartialNick"
    };

    const profile = await FirstDateService.updateProfile(authUser(), partialPayload, injected());
    expect(profile.user.nickname).toBe("PartialNick");
    expect(profile.user.csoDistrict).toBe("Suthep"); // Unchanged
    expect(profile.travelLegs).toHaveLength(1); // Unchanged
  });

  it("throws NOT_FOUND if the user is unregistered", async () => {
    await expect(
      FirstDateService.updateProfile(authUser(), validInput(), injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
