import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { GroupsService } from "../src/services/groups.service";
import { HousesService } from "../src/services/houses.service";

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

describe("HousesService", () => {
  it("listHouses lists all houses", async () => {
    await createHouse("H1");
    await createHouse("H2");

    const result = await HousesService.listHouses(injected());
    expect(result).toHaveLength(2);
    expect(result.map((h) => h.code)).toContain("H1");
  });

  it("getHouse resolves a single house by id", async () => {
    const h1 = await createHouse("H1");
    const result = await HousesService.getHouse(h1.id, injected());
    expect(result.code).toBe("H1");
  });

  it("getHouseStats sums member weights correctly and counts ONLY rank-1 choices", async () => {
    const h1 = await createHouse("H1");
    const h2 = await createHouse("H2");

    // Group A (2 members) -> Choice H1 rank 1, Choice H2 rank 2
    const leaderA = await createStudent("6900000001", "leaderA@student.chula.ac.th");
    const groupA = await createGroup(leaderA.id, "AAAAAA");
    await createRegistration(leaderA.id, groupA.id);
    const memberA2 = await createStudent("6900000002", "memberA2@student.chula.ac.th");
    await createRegistration(memberA2.id, groupA.id);
    await GroupsService.setHousePreferences("6900000001", [h1.id, h2.id], injected());

    // Group B (1 member) -> Choice H2 rank 1, Choice H1 rank 2
    const leaderB = await createStudent("6900000003", "leaderB@student.chula.ac.th");
    const groupB = await createGroup(leaderB.id, "BBBBBB");
    await createRegistration(leaderB.id, groupB.id);
    await GroupsService.setHousePreferences("6900000003", [h2.id, h1.id], injected());

    const stats = await HousesService.getHouseStats(injected());
    expect(stats).toHaveLength(2);
    // H1 has 2 applicants (from Group A rank 1), H2 has 1 applicant (from Group B rank 1)
    // Rank 2 choices (H2 for Group A, H1 for Group B) must NOT contribute to stats.
    const h1Stat = stats.find((s) => s.houseId === h1.id);
    const h2Stat = stats.find((s) => s.houseId === h2.id);
    expect(h1Stat?.count).toBe(2);
    expect(h2Stat?.count).toBe(1);
  });

  it("getHouseResult returns assignment if announce date passed", async () => {
    const h1 = await createHouse("H1");
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA", h1.id); // assign house
    await createRegistration(leader.id, group.id);

    mockEventActive = true; // result active

    const house = await HousesService.getHouseResult("6900000001", injected());
    expect(house).not.toBeNull();
    expect(house?.code).toBe("H1");
  });

  it("getHouseResult rejects if announce date has not passed", async () => {
    const h1 = await createHouse("H1");
    const leader = await createStudent("6900000001", "leader@student.chula.ac.th");
    const group = await createGroup(leader.id, "AAAAAA", h1.id);
    await createRegistration(leader.id, group.id);

    mockEventActive = false; // result inactive

    await expect(HousesService.getHouseResult("6900000001", injected())).rejects.toThrow();
  });
});
