import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { GroupsService } from "../src/services/groups.service";

let mockEventActive = true;
let mockEventPassed = false;

mock.module("../src/utils/flags", () => ({
  isEventActive: () => mockEventActive,
  isEventPassed: () => mockEventPassed
}));

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
  await client.exec(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
});

// Helper creators to speed up test setup
async function createStudent(
  studentId: string,
  email: string,
  role: "student" | "staff" = "student"
) {
  const [student] = await db
    .insert(schema.students)
    .values({
      studentId,
      email,
      firstName: "Som",
      lastName: "Chai",
      role
    })
    .returning();
  return student;
}

async function createRegistration(studentId: string, groupId: string | null = null) {
  const [registration] = await db
    .insert(schema.registrations)
    .values({
      studentId,
      project: "rpkm",
      pdpaAcceptedAt: new Date(),
      groupId
    })
    .returning();
  return registration;
}

async function createGroup(
  leaderId: string,
  joinCode: string,
  assignedHouseId: string | null = null
) {
  const [group] = await db
    .insert(schema.groups)
    .values({
      leaderId,
      joinCode,
      assignedHouseId
    })
    .returning();
  return group;
}

async function createHouse(code: string, capacity: number = 50) {
  const [house] = await db
    .insert(schema.houses)
    .values({
      code,
      capacity
    })
    .returning();
  return house;
}

describe("GroupsService — join", () => {
  it("allows a freshman student to join another group, deleting their old solo group", async () => {
    const leaderA = await createStudent("6900000001", "leaderA@student.chula.ac.th");
    const groupA = await createGroup(leaderA.id, "AAAAAA");
    await createRegistration(leaderA.id, groupA.id);

    const studentB = await createStudent("6900000002", "studentB@student.chula.ac.th");
    const groupB = await createGroup(studentB.id, "BBBBBB");
    await createRegistration(studentB.id, groupB.id);

    // B joins group A
    const result = await GroupsService.join("6900000002", "AAAAAA", injected());
    expect(result.id).toBe(groupA.id);
    expect(result.members).toHaveLength(2);
    expect(result.members.map((m) => m.userId)).toContain(studentB.id);

    // Verify group B was deleted because B left and it became empty
    const remainingGroups = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, groupB.id));
    expect(remainingGroups).toHaveLength(0);
  });

  it("rejects joining if caller is not a freshman", async () => {
    await expect(GroupsService.join("6600000001", "AAAAAA", injected())).rejects.toThrow();
  });

  it("rejects joining with invalid join code", async () => {
    await createStudent("6900000001", "student@student.chula.ac.th");
    await expect(GroupsService.join("6900000001", "INVALID", injected())).rejects.toThrow();
  });

  it("rejects if target group is already confirmed", async () => {
    const leaderA = await createStudent("6900000001", "leaderA@student.chula.ac.th");
    const groupA = await db
      .insert(schema.groups)
      .values({ leaderId: leaderA.id, joinCode: "AAAAAA", confirmedAt: new Date() })
      .returning();
    await createRegistration(leaderA.id, groupA[0].id);

    const studentB = await createStudent("6900000002", "studentB@student.chula.ac.th");
    const groupB = await createGroup(studentB.id, "BBBBBB");
    await createRegistration(studentB.id, groupB.id);

    await expect(GroupsService.join("6900000002", "AAAAAA", injected())).rejects.toThrow();
  });

  it("rejects if target group is full (>=4 members)", async () => {
    const leaderA = await createStudent("6900000001", "leaderA@student.chula.ac.th");
    const groupA = await createGroup(leaderA.id, "AAAAAA");
    await createRegistration(leaderA.id, groupA.id);

    // Fill up group A
    for (let i = 2; i <= 4; i++) {
      const student = await createStudent(`690000000${i}`, `student${i}@student.chula.ac.th`);
      await createRegistration(student.id, groupA.id);
    }

    // Try to join with a 5th student
    const student5 = await createStudent("6900000005", "student5@student.chula.ac.th");
    const group5 = await createGroup(student5.id, "555555");
    await createRegistration(student5.id, group5.id);

    await expect(GroupsService.join("6900000005", "AAAAAA", injected())).rejects.toThrow();
  });

  it("rejects if caller is a leader of a group with other members", async () => {
    // Group A (Leader A, Member B)
    const leaderA = await createStudent("6900000001", "leaderA@student.chula.ac.th");
    const groupA = await createGroup(leaderA.id, "AAAAAA");
    await createRegistration(leaderA.id, groupA.id);

    const studentB = await createStudent("6900000002", "studentB@student.chula.ac.th");
    await createRegistration(studentB.id, groupA.id);

    // Group C (Leader C)
    const leaderC = await createStudent("6900000003", "leaderC@student.chula.ac.th");
    const groupC = await createGroup(leaderC.id, "CCCCCC");
    await createRegistration(leaderC.id, groupC.id);

    // Leader A tries to join Group C (should be blocked since A has members)
    await expect(GroupsService.join("6900000001", "CCCCCC", injected())).rejects.toThrow();
  });

  it("rejects joining once the house-pick window has passed", async () => {
    const leaderA = await createStudent("6900000001", "leaderA@student.chula.ac.th");
    const groupA = await createGroup(leaderA.id, "AAAAAA");
    await createRegistration(leaderA.id, groupA.id);

    const studentB = await createStudent("6900000002", "studentB@student.chula.ac.th");
    const groupB = await createGroup(studentB.id, "BBBBBB");
    await createRegistration(studentB.id, groupB.id);

    mockEventPassed = true;
    await expect(GroupsService.join("6900000002", "AAAAAA", injected())).rejects.toThrow();
  });
});

describe("GroupsService — getMyGroup", () => {
  it("returns the group and member details for a registered student", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const result = await GroupsService.getMyGroup("6900000001", injected());
    expect(result.id).toBe(group.id);
    expect(result.joinCode).toBe("AAAAAA");
    expect(result.members).toHaveLength(1);
    expect(result.members[0].userId).toBe(leader.id);
    expect(result.members[0].isLeader).toBe(true);
  });
});

describe("GroupsService — house preferences", () => {
  it("allows setting, getting, and overwriting (upserting) house preferences in order", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const h1 = await createHouse("H1");
    const h2 = await createHouse("H2");

    // 1. Initial Set choices
    const setRes = await GroupsService.setHousePreferences(
      "6900000001",
      [h1.id, h2.id],
      injected()
    );
    expect(setRes.housePreferences).toHaveLength(2);
    expect(setRes.housePreferences[0].houseId).toBe(h1.id);
    expect(setRes.housePreferences[0].rank).toBe(1);

    // 2. Overwrite choices completely (upsert)
    const overwriteRes = await GroupsService.setHousePreferences("6900000001", [h2.id], injected());
    expect(overwriteRes.housePreferences).toHaveLength(1);
    expect(overwriteRes.housePreferences[0].houseId).toBe(h2.id);
    expect(overwriteRes.housePreferences[0].rank).toBe(1);

    // 3. Get choices to confirm the first choice H1 was removed and only H2 remains
    const getRes = await GroupsService.getHousePreferences("6900000001", injected());
    expect(getRes.housePreferences).toHaveLength(1);
    expect(getRes.housePreferences[0].houseId).toBe(h2.id);
    expect(getRes.housePreferences[0].rank).toBe(1);
  });

  it("rejects setting preferences if caller is not the group leader", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const member = await createStudent("6900000002", "member@student.chula.ac.th");
    await createRegistration(member.id, group.id);

    const h1 = await createHouse("H1");

    await expect(
      GroupsService.setHousePreferences("6900000002", [h1.id], injected())
    ).rejects.toThrow();
  });

  it("rejects setting preferences if the house pick period has ended", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const h1 = await createHouse("H1");

    mockEventPassed = true; // pick period passed

    await expect(
      GroupsService.setHousePreferences("6900000001", [h1.id], injected())
    ).rejects.toThrow();
  });
});

describe("GroupsService — regenerateJoinCode", () => {
  it("regenerates the join code successfully for the leader", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const newCode = await GroupsService.regenerateJoinCode("6900000001", injected());
    expect(newCode).not.toBe("AAAAAA");
    expect(newCode).toMatch(/^[A-Z0-9]{6}$/);

    const [updatedGroup] = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, group.id));
    expect(updatedGroup.joinCode).toBe(newCode);
  });

  it("rejects join code regeneration if the caller is not the leader", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const member = await createStudent("6900000002", "member@student.chula.ac.th");
    await createRegistration(member.id, group.id);

    await expect(GroupsService.regenerateJoinCode("6900000002", injected())).rejects.toThrow();
  });
});

describe("GroupsService — leave", () => {
  it("allows a non-leader member to leave, putting them in their own solo group", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const member = await createStudent("6900000002", "member@student.chula.ac.th");
    await createRegistration(member.id, group.id);

    // Member B leaves
    const result = await GroupsService.leave("6900000002", injected());
    expect(result.leaderId).toBe(member.id); // Leader of their own new solo group

    // Verify old group still exists with leader A only
    const oldGroupMembers = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.groupId, group.id));
    expect(oldGroupMembers).toHaveLength(1);
    expect(oldGroupMembers[0].studentId).toBe(leader.id);
  });

  it("dissolves the group if the leader leaves, giving all members fresh solo groups", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const member = await createStudent("6900000002", "member@student.chula.ac.th");
    await createRegistration(member.id, group.id);

    // Leader leaves
    const result = await GroupsService.leave("6900000001", injected());
    expect(result.leaderId).toBe(leader.id);

    // Verify old group is deleted
    const oldGroups = await db.select().from(schema.groups).where(eq(schema.groups.id, group.id));
    expect(oldGroups).toHaveLength(0);

    // Verify member is also in a new solo group
    const [memberReg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.studentId, member.id));
    const [memberGroup] = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, memberReg.groupId!));
    expect(memberGroup.leaderId).toBe(member.id);
  });

  it("rejects leaving once the house-pick window has passed", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const member = await createStudent("6900000002", "member@student.chula.ac.th");
    await createRegistration(member.id, group.id);

    mockEventPassed = true;
    await expect(GroupsService.leave("6900000002", injected())).rejects.toThrow();
  });
});

describe("GroupsService — kickMember", () => {
  it("allows leader to kick a member, placing the kicked member in a new solo group", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const member = await createStudent("6900000002", "member@student.chula.ac.th");
    await createRegistration(member.id, group.id);

    // Leader kicks member
    const result = await GroupsService.kickMember("6900000001", member.id, injected());
    expect(result.id).toBe(group.id); // returns old group
    expect(result.members).toHaveLength(1); // member is kicked out

    // Verify kicked member has a solo group
    const [kickedReg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.studentId, member.id));
    const [kickedGroup] = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, kickedReg.groupId!));
    expect(kickedGroup.leaderId).toBe(member.id);
  });

  it("rejects kicking if caller is not the leader", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const member = await createStudent("6900000002", "member@student.chula.ac.th");
    await createRegistration(member.id, group.id);

    await expect(GroupsService.kickMember("6900000002", leader.id, injected())).rejects.toThrow();
  });

  it("rejects kicking once the house-pick window has passed", async () => {
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA");
    await createRegistration(leader.id, group.id);

    const member = await createStudent("6900000002", "member@student.chula.ac.th");
    await createRegistration(member.id, group.id);

    mockEventPassed = true;
    await expect(GroupsService.kickMember("6900000001", member.id, injected())).rejects.toThrow();
  });
});
