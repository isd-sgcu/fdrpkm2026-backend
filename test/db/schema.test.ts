import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../../src/db/schema";

// Real Postgres (pglite, in-memory WASM) with the generated migration applied,
// so these exercise the actual constraints — not just the TS types.
let client: PGlite;
let db: PgliteDatabase<typeof schema>;

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
  await client.exec(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
});

// passes only if `run` throws (e.g. a constraint violation)
async function rejects(run: () => unknown): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error("expected the query to reject, but it resolved");
}

let seq = 0;
async function makeStudent(over: Partial<schema.NewStudent> = {}): Promise<schema.Student> {
  seq += 1;
  const [student] = await db
    .insert(schema.students)
    .values({
      studentId: `69${String(seq).padStart(8, "0")}`,
      email: `s${seq}@example.com`,
      firstName: "Som",
      lastName: "Chai",
      ...over
    })
    .returning();
  return student;
}

async function makeGroup(leaderId: string, joinCode: string): Promise<schema.Group> {
  const [group] = await db.insert(schema.groups).values({ leaderId, joinCode }).returning();
  return group;
}

describe("students", () => {
  it("fills id + timestamps + role default", async () => {
    const student = await makeStudent();
    expect(student.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(student.role).toBe("student");
    expect(student.createdAt).toBeInstanceOf(Date);
    expect(student.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a duplicate student_id", async () => {
    await makeStudent({ studentId: "6900000099", email: "a@example.com" });
    await rejects(() => makeStudent({ studentId: "6900000099", email: "b@example.com" }));
  });

  it("rejects a duplicate email", async () => {
    await makeStudent({ studentId: "6900000001", email: "dupe@example.com" });
    await rejects(() => makeStudent({ studentId: "6900000002", email: "dupe@example.com" }));
  });

  it("rejects a role outside the enum", async () => {
    await rejects(() =>
      client.query(
        `INSERT INTO students (student_id, email, first_name, last_name, role)
         VALUES ('6900000003', 'role@example.com', 'A', 'B', 'superadmin')`
      )
    );
  });
});

describe("registrations", () => {
  it("lets one student register for BOTH projects", async () => {
    const student = await makeStudent();
    const rows = await db
      .insert(schema.registrations)
      .values([
        { studentId: student.id, project: "firstdate", pdpaAcceptedAt: new Date() },
        { studentId: student.id, project: "rpkm", pdpaAcceptedAt: new Date() }
      ])
      .returning();
    expect(rows).toHaveLength(2);
  });

  it("rejects the same (student, project) twice", async () => {
    const student = await makeStudent();
    await db
      .insert(schema.registrations)
      .values({ studentId: student.id, project: "rpkm", pdpaAcceptedAt: new Date() });
    await rejects(() =>
      db
        .insert(schema.registrations)
        .values({ studentId: student.id, project: "rpkm", pdpaAcceptedAt: new Date() })
    );
  });
});

describe("travel_legs", () => {
  async function makeRegistration(): Promise<string> {
    const student = await makeStudent();
    const [reg] = await db
      .insert(schema.registrations)
      .values({ studentId: student.id, project: "rpkm", pdpaAcceptedAt: new Date() })
      .returning();
    return reg.id;
  }

  const leg = (registrationId: string, seqNo: number): schema.NewTravelLeg => ({
    registrationId,
    seq: seqNo,
    vehicle: "bus",
    originDistrict: "watthana",
    originProvince: "bangkok",
    destinationDistrict: "pathumwan",
    destinationProvince: "bangkok"
  });

  it("accepts legs 1 through 4", async () => {
    const registrationId = await makeRegistration();
    const rows = await db
      .insert(schema.travelLegs)
      .values([
        leg(registrationId, 1),
        leg(registrationId, 2),
        leg(registrationId, 3),
        leg(registrationId, 4)
      ])
      .returning();
    expect(rows).toHaveLength(4);
  });

  it("rejects seq outside 1..4 (CHECK)", async () => {
    const registrationId = await makeRegistration();
    await rejects(() => db.insert(schema.travelLegs).values(leg(registrationId, 0)));
    await rejects(() => db.insert(schema.travelLegs).values(leg(registrationId, 5)));
  });

  it("rejects two leg-1s for one registration", async () => {
    const registrationId = await makeRegistration();
    await db.insert(schema.travelLegs).values(leg(registrationId, 1));
    await rejects(() => db.insert(schema.travelLegs).values(leg(registrationId, 1)));
  });

  it("cascades on registration delete", async () => {
    const registrationId = await makeRegistration();
    await db.insert(schema.travelLegs).values([leg(registrationId, 1), leg(registrationId, 2)]);
    await db.delete(schema.registrations).where(eq(schema.registrations.id, registrationId));
    const left = await db.select().from(schema.travelLegs);
    expect(left).toHaveLength(0);
  });
});

describe("groups & membership", () => {
  it("keeps the member but nulls group_id when its group is deleted (SET NULL)", async () => {
    const student = await makeStudent();
    const group = await makeGroup(student.id, "111111");
    const [reg] = await db
      .insert(schema.registrations)
      .values({
        studentId: student.id,
        project: "rpkm",
        pdpaAcceptedAt: new Date(),
        groupId: group.id
      })
      .returning();

    await db.delete(schema.groups).where(eq(schema.groups.id, group.id));

    const after = await db.query.registrations.findFirst({
      where: eq(schema.registrations.id, reg.id)
    });
    expect(after).toBeTruthy();
    expect(after?.groupId).toBeNull();
  });

  it("resolves members + leader through relations", async () => {
    const leader = await makeStudent();
    const member = await makeStudent();
    const group = await makeGroup(leader.id, "222222");
    await db.insert(schema.registrations).values([
      { studentId: leader.id, project: "rpkm", pdpaAcceptedAt: new Date(), groupId: group.id },
      { studentId: member.id, project: "rpkm", pdpaAcceptedAt: new Date(), groupId: group.id }
    ]);

    const withMembers = await db.query.groups.findFirst({
      where: eq(schema.groups.id, group.id),
      with: { members: true, leader: true }
    });
    expect(withMembers?.members).toHaveLength(2);
    expect(withMembers?.leader.id).toBe(leader.id);
  });
});

describe("group_house_choices", () => {
  async function setup(): Promise<{ groupId: string; houseId: string }> {
    const leader = await makeStudent();
    const group = await makeGroup(leader.id, "333333");
    const [house] = await db.insert(schema.houses).values({ code: "phra_kiao" }).returning();
    return { groupId: group.id, houseId: house.id };
  }

  it("accepts rank 1..5 and rejects 0 / 6 (CHECK)", async () => {
    const { groupId, houseId } = await setup();
    await db.insert(schema.groupHouseChoices).values({ groupId, houseId, rank: 1 });
    await rejects(() => db.insert(schema.groupHouseChoices).values({ groupId, houseId, rank: 0 }));
    await rejects(() => db.insert(schema.groupHouseChoices).values({ groupId, houseId, rank: 6 }));
  });

  it("rejects a duplicate rank within a group", async () => {
    const { groupId, houseId } = await setup();
    const [other] = await db.insert(schema.houses).values({ code: "chaiya_phruek" }).returning();
    await db.insert(schema.groupHouseChoices).values({ groupId, houseId, rank: 1 });
    await rejects(() =>
      db.insert(schema.groupHouseChoices).values({ groupId, houseId: other.id, rank: 1 })
    );
  });

  it("rejects the same house twice in a group", async () => {
    const { groupId, houseId } = await setup();
    await db.insert(schema.groupHouseChoices).values({ groupId, houseId, rank: 1 });
    await rejects(() => db.insert(schema.groupHouseChoices).values({ groupId, houseId, rank: 2 }));
  });

  it("cascades on group delete", async () => {
    const { groupId, houseId } = await setup();
    await db.insert(schema.groupHouseChoices).values({ groupId, houseId, rank: 1 });
    await db.delete(schema.groups).where(eq(schema.groups.id, groupId));
    const left = await db.select().from(schema.groupHouseChoices);
    expect(left).toHaveLength(0);
  });
});

describe("scan tables", () => {
  it("entries: one entry per (project, student)", async () => {
    const nong = await makeStudent();
    const staff = await makeStudent({ role: "staff" });
    await db
      .insert(schema.entries)
      .values({ project: "firstdate", studentId: nong.id, scannedBy: staff.id });
    await rejects(() =>
      db
        .insert(schema.entries)
        .values({ project: "firstdate", studentId: nong.id, scannedBy: staff.id })
    );
    // same student, other project is fine
    await db
      .insert(schema.entries)
      .values({ project: "rpkm", studentId: nong.id, scannedBy: staff.id });
  });

  it("scans: one credit per (checkpoint, student)", async () => {
    const nong = await makeStudent();
    const [cp] = await db
      .insert(schema.checkpoints)
      .values({ game: "jigsaw", code: "JIG-01" })
      .returning();
    await db.insert(schema.scans).values({ checkpointId: cp.id, studentId: nong.id });
    await rejects(() =>
      db.insert(schema.scans).values({ checkpointId: cp.id, studentId: nong.id })
    );
  });
});

describe("email", () => {
  it("is unique case-insensitively", async () => {
    await makeStudent({ studentId: "6900001000", email: "Foo@Example.com" });
    await rejects(() => makeStudent({ studentId: "6900001001", email: "foo@example.com" }));
  });
});

describe("updated_at trigger", () => {
  it("forces updated_at to now() on any UPDATE — even raw SQL", async () => {
    const student = await makeStudent();
    // smuggle in an old timestamp via raw SQL; the BEFORE UPDATE trigger must override it
    await client.query(
      "UPDATE students SET first_name = 'X', updated_at = '2000-01-01' WHERE id = $1",
      [student.id]
    );
    const [after] = await db
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, student.id));
    expect(after.updatedAt.getUTCFullYear()).toBeGreaterThan(2000);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(after.createdAt.getTime());
  });
});

describe("travel_legs vehicle_other consistency", () => {
  async function makeRegistration(): Promise<string> {
    const student = await makeStudent();
    const [reg] = await db
      .insert(schema.registrations)
      .values({ studentId: student.id, project: "rpkm", pdpaAcceptedAt: new Date() })
      .returning();
    return reg.id;
  }

  it("requires vehicle_other when vehicle = 'other'", async () => {
    const registrationId = await makeRegistration();
    await rejects(() =>
      db.insert(schema.travelLegs).values({
        registrationId,
        seq: 1,
        vehicle: "other",
        originDistrict: "watthana",
        originProvince: "bangkok",
        destinationDistrict: "pathumwan",
        destinationProvince: "bangkok"
      })
    );
  });

  it("forbids vehicle_other when vehicle != 'other'", async () => {
    const registrationId = await makeRegistration();
    await rejects(() =>
      db.insert(schema.travelLegs).values({
        registrationId,
        seq: 1,
        vehicle: "bus",
        vehicleOther: "ขยะ",
        originDistrict: "watthana",
        originProvince: "bangkok",
        destinationDistrict: "pathumwan",
        destinationProvince: "bangkok"
      })
    );
  });

  it("accepts vehicle = 'other' with vehicle_other set", async () => {
    const registrationId = await makeRegistration();
    const rows = await db
      .insert(schema.travelLegs)
      .values({
        registrationId,
        seq: 1,
        vehicle: "other",
        vehicleOther: "Songthaew",
        originDistrict: "watthana",
        originProvince: "bangkok",
        destinationDistrict: "pathumwan",
        destinationProvince: "bangkok"
      })
      .returning();
    expect(rows).toHaveLength(1);
  });
});

describe("FK RESTRICT (never delete people / houses / points mid-event)", () => {
  it("blocks deleting a student who has a registration", async () => {
    const student = await makeStudent();
    await db
      .insert(schema.registrations)
      .values({ studentId: student.id, project: "rpkm", pdpaAcceptedAt: new Date() });
    await rejects(() => db.delete(schema.students).where(eq(schema.students.id, student.id)));
  });

  it("blocks deleting a house referenced by a group's choices", async () => {
    const leader = await makeStudent();
    const group = await makeGroup(leader.id, "444444");
    const [house] = await db.insert(schema.houses).values({ code: "intania" }).returning();
    await db
      .insert(schema.groupHouseChoices)
      .values({ groupId: group.id, houseId: house.id, rank: 1 });
    await rejects(() => db.delete(schema.houses).where(eq(schema.houses.id, house.id)));
  });

  it("blocks deleting a checkpoint that has a scan", async () => {
    const nong = await makeStudent();
    const [cp] = await db
      .insert(schema.checkpoints)
      .values({ game: "csr", code: "CSR-99" })
      .returning();
    await db.insert(schema.scans).values({ checkpointId: cp.id, studentId: nong.id });
    await rejects(() => db.delete(schema.checkpoints).where(eq(schema.checkpoints.id, cp.id)));
  });
});

describe("checkpoints", () => {
  it("defaults geofence_radius_m to 50", async () => {
    const [cp] = await db
      .insert(schema.checkpoints)
      .values({ game: "jigsaw", code: "JIG-50" })
      .returning();
    expect(cp.geofenceRadiusM).toBe(50);
  });
});
