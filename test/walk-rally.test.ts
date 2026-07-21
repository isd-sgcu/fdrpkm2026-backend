import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { WalkRallyService } from "../src/services/walk-rally.service";

let mockEventActive = true;
const isEventActiveMock = mock((eventName: string) => {
  void eventName;
  return mockEventActive;
});

let mockEventPassed = false;
const isEventPassedMock = mock((eventName: string) => {
  void eventName;
  return mockEventPassed;
});

mock.module("../src/utils/flags", () => ({
  isEventActive: isEventActiveMock,
  isEventPassed: isEventPassedMock
}));

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
const injected = (): { db: Database } => ({ db: db as unknown as Database });

const TABLES = [
  "students",
  "registrations",
  "walk_rally_activities",
  "walk_rally_registrations",
  "walk_rally_attendances"
];

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
  mockEventPassed = false;
  isEventActiveMock.mockClear();
  isEventPassedMock.mockClear();
  await client.exec(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
});

async function createStudent(studentId: string) {
  const [student] = await db
    .insert(schema.students)
    .values({
      studentId,
      email: `${studentId}@student.chula.ac.th`,
      firstName: "Som",
      lastName: "Chai",
      role: "student"
    })
    .returning();
  return student;
}

async function createActivity(code: string, kind: "workshop" | "museum" | "minigame" = "museum") {
  const [activity] = await db.insert(schema.walkRallyActivities).values({ code, kind }).returning();
  return activity;
}

async function createStaff(studentId: string) {
  const [staff] = await db
    .insert(schema.students)
    .values({
      studentId,
      email: `${studentId}@student.chula.ac.th`,
      firstName: "Staff",
      lastName: "One",
      role: "staff"
    })
    .returning();
  return staff;
}

// STAFF_GATE (checkin.helper.ts) requires a registrations row with a
// matching staffRole, not just students.role = "staff".
async function createStaffReg(
  staffId: string,
  staffRole: "firstdate" | "rpkm" | "freshmennight" | "walkrally"
) {
  await db.insert(schema.registrations).values({
    studentId: staffId,
    project: "rpkm",
    pdpaAcceptedAt: new Date(),
    staffRole
  });
}

async function createRegistration(
  studentId: string,
  activityId: string,
  round: number,
  createdAt: Date
) {
  const [registration] = await db
    .insert(schema.walkRallyRegistrations)
    .values({ studentId, activityId, round, createdAt })
    .returning();
  return registration;
}

async function createAttendance(studentId: string, activityId: string, scannedBy: string) {
  const [attendance] = await db
    .insert(schema.walkRallyAttendances)
    .values({ studentId, activityId, scannedBy, source: "onsite" })
    .returning();
  return attendance;
}

describe("WalkRallyService.getActivityRounds", () => {
  it("rejects if the student can't be resolved", async () => {
    await expect(
      WalkRallyService.getActivityRounds("6900000099", "MUS-01", injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an unknown activity code", async () => {
    await createStudent("6900000001");
    await expect(
      WalkRallyService.getActivityRounds("6900000001", "NOPE", injected())
    ).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });

  it("returns all 6 rounds with zero counts and no conflict when nothing's booked", async () => {
    await createStudent("6900000001");
    await createActivity("MUS-01");

    const result = await WalkRallyService.getActivityRounds("6900000001", "MUS-01", injected());
    expect(result.rounds).toHaveLength(6);
    expect(result.rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.registeredRound).toBeNull();
    for (const r of result.rounds) {
      expect(r.count).toBe(0);
      expect(r.conflict).toBeUndefined();
    }
  });

  it("returns the student's own round number when registered for this activity", async () => {
    const student = await createStudent("6900000001");
    const activity = await createActivity("MUS-01");
    await db.insert(schema.walkRallyRegistrations).values({
      studentId: student.id,
      activityId: activity.id,
      round: 3
    });

    const result = await WalkRallyService.getActivityRounds("6900000001", "MUS-01", injected());
    expect(result.registeredRound).toBe(3);
  });

  it("reports count without disabling the round (no capacity check here)", async () => {
    const activity = await createActivity("MUS-01");

    const fillers = await Promise.all(
      Array.from({ length: 30 }, (_, i) => createStudent(`690000${String(i).padStart(4, "0")}`))
    );
    await db
      .insert(schema.walkRallyRegistrations)
      .values(fillers.map((s) => ({ studentId: s.id, activityId: activity.id, round: 2 })));

    const viewer = await createStudent("6900009999");
    const result = await WalkRallyService.getActivityRounds(viewer.studentId, "MUS-01", injected());
    const round2 = result.rounds.find((r) => r.round === 2);
    expect(round2?.count).toBe(30);
    expect(round2?.conflict).toBeUndefined();
  });

  it("marks a round's conflict when the student booked a different activity whose time overlaps", async () => {
    const student = await createStudent("6900000001");
    // cu-museum round 3: 13:10-13:40 — overlaps default (MG-01) round 4: 13:00-13:30.
    const otherActivity = await createActivity("cu-museum", "museum");
    await createActivity("MG-01", "minigame");

    await db.insert(schema.walkRallyRegistrations).values({
      studentId: student.id,
      activityId: otherActivity.id,
      round: 3
    });

    const result = await WalkRallyService.getActivityRounds("6900000001", "MG-01", injected());
    const round4 = result.rounds.find((r) => r.round === 4);
    expect(round4?.conflict).toEqual({ code: "cu-museum" });
    // Other rounds are unaffected.
    expect(result.rounds.find((r) => r.round === 1)?.conflict).toBeUndefined();
  });

  it("does not conflict with the student's own registration for the SAME activity", async () => {
    const student = await createStudent("6900000001");
    const activity = await createActivity("MUS-01");
    await db.insert(schema.walkRallyRegistrations).values({
      studentId: student.id,
      activityId: activity.id,
      round: 1
    });

    const result = await WalkRallyService.getActivityRounds("6900000001", "MUS-01", injected());
    const round1 = result.rounds.find((r) => r.round === 1);
    // Their own booking counts toward count but isn't a "conflict" with itself.
    expect(round1?.conflict).toBeUndefined();
    expect(round1?.count).toBe(1);
  });

  it("still reports conflict regardless of count", async () => {
    const student = await createStudent("6900000001");
    // cu-museum round 4: 14:20-14:50 — overlaps default (MUS-01) round 5: 14:00-14:30.
    const otherActivity = await createActivity("cu-museum", "museum");
    const thisActivity = await createActivity("MUS-01", "museum");

    await db.insert(schema.walkRallyRegistrations).values({
      studentId: student.id,
      activityId: otherActivity.id,
      round: 4
    });

    const fillers = await Promise.all(
      Array.from({ length: 30 }, (_, i) => createStudent(`690001${String(i).padStart(4, "0")}`))
    );
    await db
      .insert(schema.walkRallyRegistrations)
      .values(fillers.map((s) => ({ studentId: s.id, activityId: thisActivity.id, round: 5 })));

    const result = await WalkRallyService.getActivityRounds("6900000001", "MUS-01", injected());
    const round5 = result.rounds.find((r) => r.round === 5);
    expect(round5?.count).toBe(30);
    expect(round5?.conflict).toEqual({ code: "cu-museum" });
  });
});

describe("WalkRallyService.getMe", () => {
  it("rejects if the student can't be resolved", async () => {
    await expect(WalkRallyService.getMe("6900000099", injected())).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });

  it("returns 0 points and no registrations for a fresh student", async () => {
    await createStudent("6900000001");

    const result = await WalkRallyService.getMe("6900000001", injected());
    expect(result.points).toBe(0);
    expect(result.registrations).toEqual([]);
  });

  it("points equals the count of the student's attendance rows", async () => {
    const student = await createStudent("6900000001");
    const staff = await createStudent("6900000002");
    const activityA = await createActivity("MUS-01");
    const activityB = await createActivity("MUS-02");
    await createAttendance(student.id, activityA.id, staff.id);
    await createAttendance(student.id, activityB.id, staff.id);

    const result = await WalkRallyService.getMe("6900000001", injected());
    expect(result.points).toBe(2);
  });

  it("resolves start/end from the activity's own schedule (default vs cu-museum)", async () => {
    const student = await createStudent("6900000001");
    const defaultActivity = await createActivity("MUS-01");
    const cuMuseum = await createActivity("cu-museum");
    const now = new Date();
    await createRegistration(student.id, defaultActivity.id, 4, now);
    await createRegistration(student.id, cuMuseum.id, 2, now);

    const result = await WalkRallyService.getMe("6900000001", injected());
    const defaultReg = result.registrations.find((r) => r.code === "MUS-01");
    const cuMuseumReg = result.registrations.find((r) => r.code === "cu-museum");
    // default round 4 = 13:00-13:30; cu-museum round 2 = 12:35-13:05.
    expect(defaultReg).toMatchObject({ round: 4, start: "13:00", end: "13:30" });
    expect(cuMuseumReg).toMatchObject({ round: 2, start: "12:35", end: "13:05" });
  });

  it("orders registrations by upcoming activity — soonest start time first", async () => {
    const student = await createStudent("6900000001");
    const afternoon = await createActivity("MUS-01"); // default round 5: 14:00-14:30
    const morning = await createActivity("MUS-02"); // default round 1: 09:00-09:30
    const midday = await createActivity("cu-museum"); // round 2: 12:35-13:05
    const now = new Date();
    // Registered out of chronological order, to prove the response re-sorts them.
    await createRegistration(student.id, afternoon.id, 5, now);
    await createRegistration(student.id, morning.id, 1, now);
    await createRegistration(student.id, midday.id, 2, now);

    const result = await WalkRallyService.getMe("6900000001", injected());
    expect(result.registrations.map((r) => r.code)).toEqual(["MUS-02", "cu-museum", "MUS-01"]);
  });

  it("assigns place by signup order within the (activity, round) slot, and shifts down when an earlier registrant is removed", async () => {
    const activity = await createActivity("MUS-01");
    const first = await createStudent("6900000001");
    const second = await createStudent("6900000002");
    const third = await createStudent("6900000003");
    const base = Date.now();
    const firstReg = await createRegistration(first.id, activity.id, 1, new Date(base));
    await createRegistration(second.id, activity.id, 1, new Date(base + 1000));
    await createRegistration(third.id, activity.id, 1, new Date(base + 2000));

    expect((await WalkRallyService.getMe("6900000001", injected())).registrations[0]?.place).toBe(
      1
    );
    expect((await WalkRallyService.getMe("6900000002", injected())).registrations[0]?.place).toBe(
      2
    );
    expect((await WalkRallyService.getMe("6900000003", injected())).registrations[0]?.place).toBe(
      3
    );

    // The first registrant cancels — everyone behind them shifts down.
    await db
      .delete(schema.walkRallyRegistrations)
      .where(eq(schema.walkRallyRegistrations.id, firstReg.id));

    expect((await WalkRallyService.getMe("6900000002", injected())).registrations[0]?.place).toBe(
      1
    );
    expect((await WalkRallyService.getMe("6900000003", injected())).registrations[0]?.place).toBe(
      2
    );
  });
});

describe("WalkRallyService.registerForActivity", () => {
  it("rejects if the student can't be resolved", async () => {
    await expect(
      WalkRallyService.registerForActivity("6900000099", { code: "MUS-01", round: 1 }, injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects outside the registration window", async () => {
    mockEventActive = false;
    await createStudent("6900000001");
    await createActivity("MUS-01");

    await expect(
      WalkRallyService.registerForActivity("6900000001", { code: "MUS-01", round: 1 }, injected())
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });

  it("rejects an unknown activity code", async () => {
    await createStudent("6900000001");
    await expect(
      WalkRallyService.registerForActivity("6900000001", { code: "NOPE", round: 1 }, injected())
    ).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });

  it("registers the student and returns the activity code + round", async () => {
    await createStudent("6900000001");
    await createActivity("MUS-01");

    const result = await WalkRallyService.registerForActivity(
      "6900000001",
      { code: "MUS-01", round: 2 },
      injected()
    );
    expect(result).toEqual({ code: "MUS-01", round: 2 });

    const [row] = await db
      .select()
      .from(schema.walkRallyRegistrations)
      .innerJoin(schema.students, eq(schema.walkRallyRegistrations.studentId, schema.students.id))
      .where(eq(schema.students.studentId, "6900000001"));
    expect(row?.walk_rally_registrations.round).toBe(2);
  });

  it("rejects a second registration for the same activity", async () => {
    const student = await createStudent("6900000001");
    const activity = await createActivity("MUS-01");
    await createRegistration(student.id, activity.id, 1, new Date());

    await expect(
      WalkRallyService.registerForActivity("6900000001", { code: "MUS-01", round: 2 }, injected())
    ).rejects.toMatchObject({ code: "ACTIVITY_ALREADY_REGISTERED" });
  });

  it("rejects the same round number on a different activity when the time slot is identical", async () => {
    const student = await createStudent("6900000001");
    // both default schedule -> round 3 is the same 11:00-11:30 slot for both
    const otherActivity = await createActivity("MUS-01");
    await createActivity("MUS-02");
    await createRegistration(student.id, otherActivity.id, 3, new Date());

    await expect(
      WalkRallyService.registerForActivity("6900000001", { code: "MUS-02", round: 3 }, injected())
    ).rejects.toMatchObject({ code: "ROUND_CONFLICT" });
  });

  it("allows the same round number on a different activity when the time slots don't overlap", async () => {
    const student = await createStudent("6900000001");
    // default round 1: 09:00-09:30; cu-museum round 1: 12:00-12:30 -- no overlap
    const defaultActivity = await createActivity("MUS-01");
    await createActivity("cu-museum");
    await createRegistration(student.id, defaultActivity.id, 1, new Date());

    const result = await WalkRallyService.registerForActivity(
      "6900000001",
      { code: "cu-museum", round: 1 },
      injected()
    );
    expect(result).toEqual({ code: "cu-museum", round: 1 });
  });

  it("rejects a different round number whose time overlaps across schedules", async () => {
    const student = await createStudent("6900000001");
    // cu-museum round 3: 13:10-13:40 — overlaps default (MUS-01) round 4: 13:00-13:30.
    const cuMuseum = await createActivity("cu-museum");
    await createActivity("MUS-01");
    await createRegistration(student.id, cuMuseum.id, 3, new Date());

    await expect(
      WalkRallyService.registerForActivity("6900000001", { code: "MUS-01", round: 4 }, injected())
    ).rejects.toMatchObject({ code: "ROUND_CONFLICT" });
  });

  it("allows two different students to register the same activity/round (no capacity check)", async () => {
    await createStudent("6900000001");
    await createStudent("6900000002");
    await createActivity("MUS-01");

    await WalkRallyService.registerForActivity(
      "6900000001",
      { code: "MUS-01", round: 1 },
      injected()
    );
    const result = await WalkRallyService.registerForActivity(
      "6900000002",
      { code: "MUS-01", round: 1 },
      injected()
    );
    expect(result).toEqual({ code: "MUS-01", round: 1 });
  });
});

describe("WalkRallyService.unregisterFromActivity", () => {
  it("rejects if the student can't be resolved", async () => {
    await expect(
      WalkRallyService.unregisterFromActivity("6900000099", "MUS-01", injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects once regClose has passed", async () => {
    mockEventPassed = true;
    await createStudent("6900000001");
    await createActivity("MUS-01");

    await expect(
      WalkRallyService.unregisterFromActivity("6900000001", "MUS-01", injected())
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });

  it("rejects an unknown activity code", async () => {
    await createStudent("6900000001");
    await expect(
      WalkRallyService.unregisterFromActivity("6900000001", "NOPE", injected())
    ).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });

  it("rejects when the student holds no registration for this activity", async () => {
    await createStudent("6900000001");
    await createActivity("MUS-01");

    await expect(
      WalkRallyService.unregisterFromActivity("6900000001", "MUS-01", injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes the registration and returns the activity code", async () => {
    const student = await createStudent("6900000001");
    const activity = await createActivity("MUS-01");
    await createRegistration(student.id, activity.id, 1, new Date());

    const result = await WalkRallyService.unregisterFromActivity(
      "6900000001",
      "MUS-01",
      injected()
    );
    expect(result).toEqual({ code: "MUS-01" });

    const remaining = await db
      .select()
      .from(schema.walkRallyRegistrations)
      .where(eq(schema.walkRallyRegistrations.studentId, student.id));
    expect(remaining).toHaveLength(0);
  });

  it("only removes the caller's registration for that activity, not other students'", async () => {
    const student = await createStudent("6900000001");
    const other = await createStudent("6900000002");
    const activity = await createActivity("MUS-01");
    await createRegistration(student.id, activity.id, 1, new Date());
    await createRegistration(other.id, activity.id, 2, new Date());

    await WalkRallyService.unregisterFromActivity("6900000001", "MUS-01", injected());

    const otherRemaining = await db
      .select()
      .from(schema.walkRallyRegistrations)
      .where(eq(schema.walkRallyRegistrations.studentId, other.id));
    expect(otherRemaining).toHaveLength(1);
  });
});

describe("WalkRallyService.changeRound", () => {
  it("rejects if the student can't be resolved", async () => {
    await expect(
      WalkRallyService.changeRound("6900000099", "MUS-01", 2, injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects outside the registration window", async () => {
    mockEventActive = false;
    await createStudent("6900000001");
    await createActivity("MUS-01");

    await expect(
      WalkRallyService.changeRound("6900000001", "MUS-01", 2, injected())
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });

  it("rejects an unknown activity code", async () => {
    await createStudent("6900000001");
    await expect(
      WalkRallyService.changeRound("6900000001", "NOPE", 2, injected())
    ).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });

  it("rejects when the student holds no registration for this activity", async () => {
    await createStudent("6900000001");
    await createActivity("MUS-01");

    await expect(
      WalkRallyService.changeRound("6900000001", "MUS-01", 2, injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("no-ops when already on the requested round, preserving place", async () => {
    const first = await createStudent("6900000001");
    const second = await createStudent("6900000002");
    const activity = await createActivity("MUS-01");
    const base = Date.now();
    const originalReg = await createRegistration(first.id, activity.id, 1, new Date(base));
    await createRegistration(second.id, activity.id, 1, new Date(base + 1000));

    const result = await WalkRallyService.changeRound("6900000001", "MUS-01", 1, injected());
    expect(result).toEqual({ code: "MUS-01", round: 1 });

    // Same row (no delete+reinsert) -> place is untouched.
    const [row] = await db
      .select()
      .from(schema.walkRallyRegistrations)
      .where(eq(schema.walkRallyRegistrations.id, originalReg.id));
    expect(row).toBeDefined();
    const me = await WalkRallyService.getMe("6900000001", injected());
    expect(me.registrations[0]?.place).toBe(1);
  });

  it("moves the registration to the new round, resetting place to the back of the new slot", async () => {
    const mover = await createStudent("6900000001");
    const filler = await createStudent("6900000002");
    const activity = await createActivity("MUS-01");
    const base = Date.now();
    await createRegistration(mover.id, activity.id, 1, new Date(base - 2000));
    // Someone else already in round 2 before the move — timestamped in the
    // past relative to the real clock, since changeRound's insert below
    // uses a real now() it can't be given an explicit createdAt to beat.
    await createRegistration(filler.id, activity.id, 2, new Date(base - 1000));

    const result = await WalkRallyService.changeRound("6900000001", "MUS-01", 2, injected());
    expect(result).toEqual({ code: "MUS-01", round: 2 });

    const me = await WalkRallyService.getMe("6900000001", injected());
    expect(me.registrations).toHaveLength(1);
    expect(me.registrations[0]).toMatchObject({ round: 2, place: 2 });

    // Round 1 no longer has the mover's registration.
    const round1Rows = await db
      .select()
      .from(schema.walkRallyRegistrations)
      .where(eq(schema.walkRallyRegistrations.round, 1));
    expect(round1Rows).toHaveLength(0);
  });

  it("rolls back to the old registration on ROUND_CONFLICT", async () => {
    const student = await createStudent("6900000001");
    const activityA = await createActivity("MUS-01");
    const activityB = await createActivity("MUS-02");
    await createRegistration(student.id, activityA.id, 3, new Date());
    const originalB = await createRegistration(student.id, activityB.id, 1, new Date());

    await expect(
      WalkRallyService.changeRound("6900000001", "MUS-02", 3, injected())
    ).rejects.toMatchObject({ code: "ROUND_CONFLICT" });

    // Old registration for activityB is untouched — same row, same round.
    const [row] = await db
      .select()
      .from(schema.walkRallyRegistrations)
      .where(eq(schema.walkRallyRegistrations.id, originalB.id));
    expect(row?.round).toBe(1);

    const me = await WalkRallyService.getMe("6900000001", injected());
    expect(me.registrations.find((r) => r.code === "MUS-02")?.round).toBe(1);
  });

  it("rolls back on a cross-schedule time-overlap conflict", async () => {
    const student = await createStudent("6900000001");
    // cu-museum round 3: 13:10-13:40 — overlaps default (MUS-01) round 4: 13:00-13:30.
    const cuMuseum = await createActivity("cu-museum");
    const defaultActivity = await createActivity("MUS-01");
    await createRegistration(student.id, cuMuseum.id, 3, new Date());
    await createRegistration(student.id, defaultActivity.id, 1, new Date());

    await expect(
      WalkRallyService.changeRound("6900000001", "MUS-01", 4, injected())
    ).rejects.toMatchObject({ code: "ROUND_CONFLICT" });

    const me = await WalkRallyService.getMe("6900000001", injected());
    expect(me.registrations.find((r) => r.code === "MUS-01")?.round).toBe(1);
  });
});

describe("WalkRallyService.checkAttendance", () => {
  it("rejects when the scanner isn't staff", async () => {
    await createStudent("6900000001");
    const target = await createStudent("6900000002");
    await createActivity("MUS-01");

    await expect(
      WalkRallyService.checkAttendance(
        "6900000001",
        { studentId: target.studentId, code: "MUS-01" },
        injected()
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN_NOT_STAFF" });
  });

  it("rejects when staff has no matching walkrally staffRole", async () => {
    const staff = await createStaff("6600000001");
    await createStaffReg(staff.id, "rpkm");
    const target = await createStudent("6900000002");
    await createActivity("MUS-01");

    await expect(
      WalkRallyService.checkAttendance(
        staff.studentId,
        { studentId: target.studentId, code: "MUS-01" },
        injected()
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN_NOT_STAFF" });
  });

  it("rejects an unknown target student", async () => {
    const staff = await createStaff("6600000001");
    await createStaffReg(staff.id, "walkrally");
    await createActivity("MUS-01");

    await expect(
      WalkRallyService.checkAttendance(
        staff.studentId,
        { studentId: "0000000000", code: "MUS-01" },
        injected()
      )
    ).rejects.toMatchObject({ code: "STUDENT_NOT_FOUND" });
  });

  it("rejects an unknown activity code", async () => {
    const staff = await createStaff("6600000001");
    await createStaffReg(staff.id, "walkrally");
    const target = await createStudent("6900000002");

    await expect(
      WalkRallyService.checkAttendance(
        staff.studentId,
        { studentId: target.studentId, code: "NOPE" },
        injected()
      )
    ).rejects.toMatchObject({ code: "INVALID_ACTIVITY" });
  });

  it("records a walk-in scan with source 'onsite' when there's no registration", async () => {
    const staff = await createStaff("6600000001");
    await createStaffReg(staff.id, "walkrally");
    const target = await createStudent("6900000002");
    const activity = await createActivity("MUS-01");

    const result = await WalkRallyService.checkAttendance(
      staff.studentId,
      { studentId: target.studentId, code: "MUS-01" },
      injected()
    );
    expect(result.studentId).toBe(target.id);
    expect(result.activityId).toBe(activity.id);
    expect(result.scannedBy).toBe(staff.id);

    const [row] = await db
      .select()
      .from(schema.walkRallyAttendances)
      .where(eq(schema.walkRallyAttendances.studentId, target.id));
    expect(row?.source).toBe("onsite");
  });

  it("records source 'preregis' when the student had registered for this activity (any round)", async () => {
    const staff = await createStaff("6600000001");
    await createStaffReg(staff.id, "walkrally");
    const target = await createStudent("6900000002");
    const activity = await createActivity("MUS-01");
    await createRegistration(target.id, activity.id, 3, new Date());

    await WalkRallyService.checkAttendance(
      staff.studentId,
      { studentId: target.studentId, code: "MUS-01" },
      injected()
    );

    const [row] = await db
      .select()
      .from(schema.walkRallyAttendances)
      .where(eq(schema.walkRallyAttendances.studentId, target.id));
    expect(row?.source).toBe("preregis");
  });

  it("rejects a duplicate scan with ALREADY_CHECKED_IN, carrying the original scan as context", async () => {
    const staff = await createStaff("6600000001");
    await createStaffReg(staff.id, "walkrally");
    const target = await createStudent("6900000002");
    await createActivity("MUS-01");

    const first = await WalkRallyService.checkAttendance(
      staff.studentId,
      { studentId: target.studentId, code: "MUS-01" },
      injected()
    );

    await expect(
      WalkRallyService.checkAttendance(
        staff.studentId,
        { studentId: target.studentId, code: "MUS-01" },
        injected()
      )
    ).rejects.toMatchObject({
      code: "ALREADY_CHECKED_IN",
      context: { scannedAt: first.scannedAt, scannedBy: first.scannedBy }
    });
  });

  it("rejects a 7th activity with POINTS_CAP_REACHED once the student has 6 attendances", async () => {
    const staff = await createStaff("6600000001");
    await createStaffReg(staff.id, "walkrally");
    const target = await createStudent("6900000002");
    for (let i = 1; i <= 6; i++) {
      const activity = await createActivity(`MUS-${i}`);
      await WalkRallyService.checkAttendance(
        staff.studentId,
        { studentId: target.studentId, code: activity.code },
        injected()
      );
    }
    await createActivity("MUS-7");

    await expect(
      WalkRallyService.checkAttendance(
        staff.studentId,
        { studentId: target.studentId, code: "MUS-7" },
        injected()
      )
    ).rejects.toMatchObject({ code: "POINTS_CAP_REACHED" });
  });

  it("reports ALREADY_CHECKED_IN, not POINTS_CAP_REACHED, on a repeat scan once at the cap", async () => {
    const staff = await createStaff("6600000001");
    await createStaffReg(staff.id, "walkrally");
    const target = await createStudent("6900000002");
    for (let i = 1; i <= 6; i++) {
      const activity = await createActivity(`MUS-${i}`);
      await WalkRallyService.checkAttendance(
        staff.studentId,
        { studentId: target.studentId, code: activity.code },
        injected()
      );
    }

    await expect(
      WalkRallyService.checkAttendance(
        staff.studentId,
        { studentId: target.studentId, code: "MUS-6" },
        injected()
      )
    ).rejects.toMatchObject({ code: "ALREADY_CHECKED_IN" });
  });
});
