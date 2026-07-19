import { eq, and } from "drizzle-orm";
import type { Database } from "@src/db";
import { entries, registrations, students, type NewEntry } from "@src/db/schema";
import { AppError, isFreshman } from "@src/utils";

/**
 * Shared logic for "staff scans student" flows, used by both
 * RpkmService and FirstDateService. Not called directly by routes.
 */

type CheckinProject = "rpkm" | "freshmennight" | "firstdate" | "walkrally";

const STAFF_GATE: Record<
  CheckinProject,
  {
    registrationsProject: "firstdate" | "rpkm";
    staffRole: "firstdate" | "rpkm" | "freshmennight" | "walkrally";
  }
> = {
  firstdate: { registrationsProject: "firstdate", staffRole: "firstdate" },
  rpkm: { registrationsProject: "rpkm", staffRole: "rpkm" },
  freshmennight: { registrationsProject: "rpkm", staffRole: "freshmennight" },
  walkrally: { registrationsProject: "rpkm", staffRole: "walkrally" }
};

/**
 * @desc Resolves the `students` row for a CUNET id, and asserts that the student is staff
 * @throws {AppError} FORBIDDEN_NOT_STAFF
 */
export async function assertStaffForProject(
  params: { staffCunetId: string; project: CheckinProject },
  deps: { db: Database }
) {
  const { staffCunetId, project } = params;
  const { db } = deps;

  const [staff] = await db.select().from(students).where(eq(students.studentId, staffCunetId));
  if (!staff || staff.role !== "staff") throw new AppError("FORBIDDEN_NOT_STAFF");

  const gate = STAFF_GATE[project];
  const [staffReg] = await db
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.studentId, staff.id),
        eq(registrations.project, gate.registrationsProject)
      )
    );
  if (!staffReg || staffReg.staffRole !== gate.staffRole) throw new AppError("FORBIDDEN_NOT_STAFF");

  return staff;
}

export async function checkinStudent(
  params: {
    studentCunetId: string;
    staffCunetId: string;
    project: Exclude<CheckinProject, "walkrally">;
  },
  deps: { db: Database }
) {
  const { studentCunetId, staffCunetId, project } = params;
  const { db } = deps;

  const [student] = await db.select().from(students).where(eq(students.studentId, studentCunetId));
  if (!student) throw new AppError("STUDENT_NOT_FOUND");
  if (!isFreshman(studentCunetId)) throw new AppError("STUDENT_NOT_FOUND");

  const staff = await assertStaffForProject({ staffCunetId, project }, deps);

  const newEntry: NewEntry = { project, studentId: student.id, scannedBy: staff.id };

  const [inserted] = await db
    .insert(entries)
    .values(newEntry)
    .onConflictDoNothing({ target: [entries.studentId, entries.project] })
    .returning();

  if (!inserted) {
    const [existing] = await db
      .select()
      .from(entries)
      .where(and(eq(entries.studentId, student.id), eq(entries.project, project)));

    throw new AppError("ALREADY_CHECKED_IN", {
      scannedAt: existing.scannedAt,
      scannedBy: existing.scannedBy
    });
  }

  return inserted;
}
