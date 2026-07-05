import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { FdRegistrationService } from "../src/services/fd-registration.service";
import { RpkmRegistrationService } from "../src/services/rpkm-registration.service";

const { registerFd, getMe, FdRegistrationServiceError } = FdRegistrationService;

// Real Postgres (pglite, in-memory WASM) with migrations applied, exercising
// the real constraints. The services take an injected db.
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
    const result = await registerFd(authUser(), { pdpaConsent: true }, injected());

    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.registrationId).toMatch(/^[0-9a-f-]{36}$/);
    // FD result carries no group field at all.
    expect("group" in result).toBe(false);

    const [registration] = await db.select().from(schema.registrations);
    expect(registration.project).toBe("firstdate");
    expect(registration.groupId).toBeNull();
    // no group rows created for FirstDate
    expect(await db.select().from(schema.groups)).toHaveLength(0);
  });

  it("maps pno_aware to students and pno_source to registrations", async () => {
    await registerFd(
      authUser(),
      { pdpaConsent: true, pnoSgcuAwareness: "instagram", pnoReferralSource: "friend" },
      injected()
    );
    const [student] = await db.select().from(schema.students);
    const [registration] = await db.select().from(schema.registrations);
    expect(student.pnoSgcuAwareness).toBe("instagram");
    expect(registration.pnoReferralSource).toBe("friend");
  });
});

describe("registerFd — travel legs", () => {
  it("forces the last leg's destination to Pathum Wan / Bangkok", async () => {
    const result = await registerFd(
      authUser(),
      {
        pdpaConsent: true,
        travelLegs: [
          leg(),
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
    expect(rows[1].destinationDistrict).toBe("Pathum Wan");
    expect(rows[1].destinationProvince).toBe("Bangkok");
  });
});

describe("registerFd — validation", () => {
  it("rejects when pdpaConsent is not true", async () => {
    await expect(registerFd(authUser(), { pdpaConsent: false }, injected())).rejects.toThrow(
      FdRegistrationServiceError
    );
    expect(await db.select().from(schema.students)).toHaveLength(0);
  });

  it("rejects more than 2 travel legs", async () => {
    await expect(
      registerFd(authUser(), { pdpaConsent: true, travelLegs: [leg(), leg(), leg()] }, injected())
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("registerFd — resubmit", () => {
  it("preserves survey answers and legs when a resubmit omits them", async () => {
    await registerFd(
      authUser(),
      { pdpaConsent: true, pnoSgcuAwareness: "instagram", travelLegs: [leg()] },
      injected()
    );
    await registerFd(authUser(), { pdpaConsent: true }, injected());
    const [student] = await db.select().from(schema.students);
    expect(student.pnoSgcuAwareness).toBe("instagram");
    expect(await db.select().from(schema.travelLegs)).toHaveLength(1);
  });
});

describe("getMe (FirstDate)", () => {
  it("returns saved data with no group field", async () => {
    await registerFd(
      authUser(),
      { pdpaConsent: true, pnoSgcuAwareness: "instagram", travelLegs: [leg()] },
      injected()
    );
    const me = await getMe(authUser(), injected());
    expect(me.user.studentCode).toBe("6912345678");
    expect(me.registration?.pdpaConsent).toBe(true);
    expect(me.registration?.pnoSgcuAwareness).toBe("instagram");
    expect(me.travelLegs).toHaveLength(1);
    expect("group" in me).toBe(false);
  });

  it("returns a stable empty shape (id null) for a never-registered user", async () => {
    const me = await getMe(authUser(), injected());
    expect(me.user.id).toBeNull();
    expect(me.registration).toBeNull();
    expect(me.travelLegs).toEqual([]);
  });
});

describe("FirstDate + RPKM share one student, separate registrations", () => {
  it("lets the same person register for both projects independently", async () => {
    const fd = await registerFd(authUser(), { pdpaConsent: true }, injected());
    const rpkm = await RpkmRegistrationService.registerRpkm(
      authUser(),
      { pdpaConsent: true },
      injected()
    );

    // one shared students row
    expect(await db.select().from(schema.students)).toHaveLength(1);
    expect(rpkm.userId).toBe(fd.userId);

    // two registrations, one per project
    const regs = await db.select().from(schema.registrations);
    expect(regs).toHaveLength(2);

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

    // exactly one group total (the RPKM one)
    expect(await db.select().from(schema.groups)).toHaveLength(1);
  });
});
