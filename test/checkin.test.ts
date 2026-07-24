import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { checkinStudent, getCheckinStatus } from "../src/services/checkin.helper";

let client: PGlite;
let db: PgliteDatabase<typeof schema>;
const injected = (): { db: Database } => ({ db: db as unknown as Database });

const TABLES = ["students", "registrations", "entries"];

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

const seedStaff = async (over: Partial<{ studentId: string; role: string }> = {}) => {
  const [staff] = await db
    .insert(schema.students)
    .values({
      studentId: over.studentId ?? "6600000001",
      email: "staff@student.chula.ac.th",
      firstName: "Staff",
      lastName: "One",
      role: (over.role as "staff" | "student") ?? "staff"
    })
    .returning();
  return staff;
};

// STAFF_GATE (checkin.helper.ts) requires a registrations row with a matching
// staffRole, not just students.role = "staff".
const seedStaffReg = async (
  staffId: string,
  project: "firstdate" | "rpkm",
  staffRole: "firstdate" | "rpkm" | "freshmennight" | "walkrally"
) => {
  await db.insert(schema.registrations).values({
    studentId: staffId,
    project,
    pdpaAcceptedAt: new Date(),
    staffRole
  });
};

const seedStudent = async (studentId = "6912345678") => {
  const [student] = await db
    .insert(schema.students)
    .values({
      studentId,
      email: `${studentId}@student.chula.ac.th`,
      firstName: "Kong",
      lastName: "Test"
    })
    .returning();
  return student;
};

describe("checkinStudent", () => {
  it("inserts an entry when staff scans a valid student", async () => {
    const staff = await seedStaff();
    await seedStaffReg(staff.id, "rpkm", "rpkm");
    const student = await seedStudent();

    const entry = await checkinStudent(
      { studentCunetId: student.studentId, staffCunetId: staff.studentId, project: "rpkm" },
      injected()
    );

    expect(entry.studentId).toBe(student.id);
    expect(entry.scannedBy).toBe(staff.id);
    expect(entry.project).toBe("rpkm");
  });

  it("throws STUDENT_NOT_FOUND when student CUNET id doesn't exist", async () => {
    const staff = await seedStaff();

    await expect(
      checkinStudent(
        { studentCunetId: "0000000000", staffCunetId: staff.studentId, project: "rpkm" },
        injected()
      )
    ).rejects.toMatchObject({ code: "STUDENT_NOT_FOUND" });
  });

  it("throws FORBIDDEN_NOT_STAFF when scanner is not staff", async () => {
    const notStaff = await seedStaff({ studentId: "6600000002", role: "student" });
    const student = await seedStudent();

    await expect(
      checkinStudent(
        { studentCunetId: student.studentId, staffCunetId: notStaff.studentId, project: "rpkm" },
        injected()
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN_NOT_STAFF" });
  });

  it("throws FORBIDDEN_NOT_STAFF when staff has no matching staffRole for the project", async () => {
    const staff = await seedStaff();
    await seedStaffReg(staff.id, "rpkm", "freshmennight");
    const student = await seedStudent();

    await expect(
      checkinStudent(
        { studentCunetId: student.studentId, staffCunetId: staff.studentId, project: "rpkm" },
        injected()
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN_NOT_STAFF" });
  });

  it("throws ALREADY_CHECKED_IN on duplicate scan for same project", async () => {
    const staff = await seedStaff();
    await seedStaffReg(staff.id, "rpkm", "rpkm");
    const student = await seedStudent();

    await checkinStudent(
      { studentCunetId: student.studentId, staffCunetId: staff.studentId, project: "rpkm" },
      injected()
    );

    await expect(
      checkinStudent(
        { studentCunetId: student.studentId, staffCunetId: staff.studentId, project: "rpkm" },
        injected()
      )
    ).rejects.toMatchObject({ code: "ALREADY_CHECKED_IN" });
  });

  it("throws STUDENT_NOT_FOUND when scanned target's CUNET id doesn't start with 69", async () => {
    const staff = await seedStaff();
    await seedStaffReg(staff.id, "rpkm", "rpkm");
    const nonFreshman = await seedStudent("6600000003");

    await expect(
      checkinStudent(
        { studentCunetId: nonFreshman.studentId, staffCunetId: staff.studentId, project: "rpkm" },
        injected()
      )
    ).rejects.toMatchObject({ code: "STUDENT_NOT_FOUND" });
  });

  it("allows the same student to check in to a different project", async () => {
    const staff = await seedStaff();
    await seedStaffReg(staff.id, "rpkm", "rpkm");
    await seedStaffReg(staff.id, "firstdate", "firstdate");
    const student = await seedStudent();

    await checkinStudent(
      { studentCunetId: student.studentId, staffCunetId: staff.studentId, project: "rpkm" },
      injected()
    );

    const entry = await checkinStudent(
      {
        studentCunetId: student.studentId,
        staffCunetId: staff.studentId,
        project: "firstdate"
      },
      injected()
    );

    expect(entry.project).toBe("firstdate");
  });
});

describe("getCheckinStatus", () => {
  it("throws NOT_FOUND when the student has no entry for the project", async () => {
    const student = await seedStudent();

    await expect(
      getCheckinStatus({ studentCunetId: student.studentId, project: "rpkm" }, injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when the CUNET id has no students row", async () => {
    await expect(
      getCheckinStatus({ studentCunetId: "0000000000", project: "rpkm" }, injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns scannedAt after a successful check-in", async () => {
    const staff = await seedStaff();
    await seedStaffReg(staff.id, "rpkm", "rpkm");
    const student = await seedStudent();

    await checkinStudent(
      { studentCunetId: student.studentId, staffCunetId: staff.studentId, project: "rpkm" },
      injected()
    );

    const status = await getCheckinStatus(
      { studentCunetId: student.studentId, project: "rpkm" },
      injected()
    );

    expect(status.scannedAt).toBeInstanceOf(Date);
  });

  it("keeps status per project independent for the same student", async () => {
    const staff = await seedStaff();
    await seedStaffReg(staff.id, "rpkm", "rpkm");
    const student = await seedStudent();

    await checkinStudent(
      { studentCunetId: student.studentId, staffCunetId: staff.studentId, project: "rpkm" },
      injected()
    );

    await expect(
      getCheckinStatus({ studentCunetId: student.studentId, project: "firstdate" }, injected())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
