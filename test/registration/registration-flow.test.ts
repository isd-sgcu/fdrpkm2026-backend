import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../../src/db";
import * as schema from "../../src/db/schema";
import { FirstDateService } from "../../src/services/firstdate.service";
import { RpkmService } from "../../src/services/rpkm.service";

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
  id: "student-1-id",
  email: "6912345678@student.chula.ac.th",
  name: "Student One",
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
  attendedDays: 3,
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

describe("Production Flow Integration Tests", () => {
  // --- FUNCTIONAL SCENARIOS ---

  it("1. student reg (fd) -> me (fd, regis: true)", async () => {
    // Student registers for FirstDate
    const regResult = await FirstDateService.registerFd(
      authUser(),
      validInput({ nickname: "One", pnoSgcuAwareness: "instagram" }),
      injected()
    );
    expect(regResult.userId).toMatch(/^[0-9a-f-]{36}$/);

    // Call getMe for FirstDate
    const me = await FirstDateService.getProfile(authUser(), injected());
    expect(me.user.id).toBe(regResult.userId);
    expect(me.user.nickname).toBe("One");
    expect(me.user.pnoSgcuAwareness).toBe("instagram");
    expect(me.user.csoDistrict).toBe("Suthep");
    expect(me.user.csoProvince).toBe("Chiang Mai");
    expect(me.user.bottle).toBeNull();
    expect(me.registration).not.toBeNull();
    expect(me.registration?.pdpaConsent).toBe(true);
    expect(me.travelLegs).toHaveLength(1);

    // Verify role is student
    const [student] = await db
      .select({ role: schema.students.role })
      .from(schema.students)
      .where(eq(schema.students.id, regResult.userId))
      .limit(1);
    expect(student.role).toBe("student");
  });

  it("2. student reg (fd) -> me (rpkm, have prefill from fd, regis: false)", async () => {
    // Student registers for FirstDate
    await FirstDateService.registerFd(
      authUser(),
      validInput({ nickname: "PrefillName", phone: "0812345678" }),
      injected()
    );

    // Call getMe for RPKM
    const me = await RpkmService.getProfile(authUser(), injected());
    // user profile fields should prefill from students table
    expect(me.user.id).not.toBeNull();
    expect(me.user.nickname).toBe("PrefillName");
    expect(me.user.phone).toBe("0812345678");
    // but registration itself for RPKM does not exist yet
    expect(me.registration).toBeNull();
    expect(me.travelLegs).toHaveLength(0);
    expect(me.group).toBeNull();
  });

  it("3. student reg (rpkm) -> me (rpkm, regis: true)", async () => {
    // Student registers for RPKM
    const regResult = await RpkmService.registerRpkm(
      authUser(),
      validInput({ nickname: "RpkmOnly" }),
      injected()
    );

    // Call getMe for RPKM
    const me = await RpkmService.getProfile(authUser(), injected());
    expect(me.user.id).toBe(regResult.userId);
    expect(me.user.nickname).toBe("RpkmOnly");
    expect(me.registration).not.toBeNull();
    expect(me.registration?.pdpaConsent).toBe(true);
    expect(me.registration?.attendedDays).toBe(3);
    expect(me.travelLegs).toHaveLength(1);
    expect(me.group).not.toBeNull();
    expect(me.group?.id).toBe(regResult.group.id);

    // Verify role is student
    const [student] = await db
      .select({ role: schema.students.role })
      .from(schema.students)
      .where(eq(schema.students.id, regResult.userId))
      .limit(1);
    expect(student.role).toBe("student");
  });

  it("4. student reg (fd) -> me (fd, regis: true) -> reg (rpkm) -> me (rpkm, regis: true)", async () => {
    const user = authUser();

    // 1. Register FD
    const fdReg = await FirstDateService.registerFd(
      user,
      validInput({ nickname: "SharedProfile" }),
      injected()
    );

    // 2. me (FD)
    const fdMe = await FirstDateService.getProfile(user, injected());
    expect(fdMe.user.id).toBe(fdReg.userId);
    expect(fdMe.registration).not.toBeNull();

    // 3. Register RPKM
    const rpkmReg = await RpkmService.registerRpkm(
      user,
      validInput({ nickname: "SharedProfile" }),
      injected()
    );
    expect(rpkmReg.userId).toBe(fdReg.userId); // should share the same student record

    // 4. me (RPKM)
    const rpkmMe = await RpkmService.getProfile(user, injected());
    expect(rpkmMe.user.id).toBe(fdReg.userId);
    expect(rpkmMe.registration).not.toBeNull();
    expect(rpkmMe.group).not.toBeNull();
  });

  it("5. staff from pre seed -> not allow to reg fd and rpkm -> able to me (fd and rpkm)", async () => {
    const staffUser = authUser({
      id: "staff-1",
      email: "staff1@student.chula.ac.th",
      name: "Staff One"
    });

    // Pre-seed staff in students table
    await db.insert(schema.students).values({
      studentId: "staff1",
      email: staffUser.email,
      firstName: "Staff",
      lastName: "One",
      role: "staff"
    });

    // 1. staff calls me (FD & RPKM) -> returns pre-seeded profile details
    const fdMe = await FirstDateService.getProfile(staffUser, injected());
    expect(fdMe.user.id).not.toBeNull();
    expect(fdMe.user.firstName).toBe("Staff");
    expect(fdMe.registration).toBeNull();

    const rpkmMe = await RpkmService.getProfile(staffUser, injected());
    expect(rpkmMe.user.id).not.toBeNull();
    expect(rpkmMe.user.firstName).toBe("Staff");
    expect(rpkmMe.registration).toBeNull();

    // 2. staff tries to register FD -> rejected
    await expect(
      FirstDateService.registerFd(staffUser, validInput(), injected())
    ).rejects.toMatchObject({ code: "NOT_FRESHMEN" });

    // 3. staff tries to register RPKM -> rejected
    await expect(
      RpkmService.registerRpkm(staffUser, validInput(), injected())
    ).rejects.toMatchObject({ code: "NOT_FRESHMEN" });
  });

  // --- EDGE CASES ---

  it("6. student reg (rpkm) -> me (fd, have prefill from rpkm, regis: false)", async () => {
    // Student registers for RPKM
    await RpkmService.registerRpkm(
      authUser(),
      validInput({ nickname: "RpkmPrefill", phone: "0999999999" }),
      injected()
    );

    // Call getMe for FirstDate
    const me = await FirstDateService.getProfile(authUser(), injected());
    expect(me.user.id).not.toBeNull();
    expect(me.user.nickname).toBe("RpkmPrefill");
    expect(me.user.phone).toBe("0999999999");
    expect(me.registration).toBeNull();
    expect(me.travelLegs).toHaveLength(0);
  });

  it("7. Never-registered student -> me (fd and rpkm, regis: false, id: null)", async () => {
    const user = authUser();

    const fdMe = await FirstDateService.getProfile(user, injected());
    expect(fdMe.user.id).toBeNull();
    expect(fdMe.user.studentId).toBe("6912345678");
    expect(fdMe.registration).toBeNull();
    expect(fdMe.travelLegs).toEqual([]);

    const rpkmMe = await RpkmService.getProfile(user, injected());
    expect(rpkmMe.user.id).toBeNull();
    expect(rpkmMe.user.studentId).toBe("6912345678");
    expect(rpkmMe.registration).toBeNull();
    expect(rpkmMe.travelLegs).toEqual([]);
  });

  it("8. Cross-project registration with profile updates keeps existing project registrations intact", async () => {
    const user = authUser();

    // Register FirstDate first
    await FirstDateService.registerFd(
      user,
      validInput({ nickname: "OriginalNick", phone: "0111111111" }),
      injected()
    );

    // Register RPKM with updated nickname and phone
    await RpkmService.registerRpkm(
      user,
      validInput({ nickname: "UpdatedNick", phone: "0222222222" }),
      injected()
    );

    // Check `/me` for FirstDate — user details updated, but registration remains correct
    const fdMe = await FirstDateService.getProfile(user, injected());
    expect(fdMe.user.nickname).toBe("UpdatedNick");
    expect(fdMe.user.phone).toBe("0222222222");
    expect(fdMe.registration).not.toBeNull();
    expect(fdMe.registration?.pdpaConsent).toBe(true);

    // Check `/me` for RPKM — details are also updated
    const rpkmMe = await RpkmService.getProfile(user, injected());
    expect(rpkmMe.user.nickname).toBe("UpdatedNick");
    expect(rpkmMe.user.phone).toBe("0222222222");
    expect(rpkmMe.registration).not.toBeNull();
    expect(rpkmMe.group).not.toBeNull();
  });

  it("9. debloated me: registered vs unregistered", async () => {
    const user = authUser();

    // 1. Unregistered -> returns registered: false
    const fdMeUnregistered = await FirstDateService.getMe(user, injected());
    expect(fdMeUnregistered).toEqual({
      id: null,
      studentId: "6912345678",
      firstName: "Student",
      lastName: "One",
      faculty: null,
      role: "student",
      registered: false,
      staffRole: null
    });

    // 2. Register FD
    const regResult = await FirstDateService.registerFd(user, validInput(), injected());

    // 3. Registered -> returns registered: true
    const fdMeRegistered = await FirstDateService.getMe(user, injected());
    expect(fdMeRegistered).toEqual({
      id: regResult.userId,
      studentId: "6912345678",
      firstName: "Student",
      lastName: "One",
      faculty: null,
      role: "student",
      registered: true,
      staffRole: null
    });
  });
});
