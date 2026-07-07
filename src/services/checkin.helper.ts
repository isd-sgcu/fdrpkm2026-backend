import { eq } from "drizzle-orm";
import type { Database } from "@src/db";
import { entries, students, type NewEntry } from "@src/db/schema";
import type { AppErrorCode } from "@src/utils";

/**
 * Shared logic for "staff scans student" flows, used by both
 * RpkmService and FirstDateService. Not called directly by routes.
 */

export class CheckinError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

type CheckinProject = "rpkm" | "freshmennight";

export async function checkinStudent(
  params: {
    studentCunetId: string;
    staffCunetId: string;
    project: CheckinProject;
  },
  deps: { db: Database }
) {
  const { studentCunetId, staffCunetId, project } = params;
  const { db } = deps;

  const [student] = await db.select().from(students).where(eq(students.studentId, studentCunetId));
  if (!student) throw new CheckinError("STUDENT_NOT_FOUND");

  const [staff] = await db.select().from(students).where(eq(students.studentId, staffCunetId));
  if (!staff) throw new CheckinError("STUDENT_NOT_FOUND");

  if (staff.role !== "staff") throw new CheckinError("FORBIDDEN_NOT_STAFF");

  const newEntry: NewEntry = { project, studentId: student.id, scannedBy: staff.id };

  try {
    const [inserted] = await db.insert(entries).values(newEntry).returning();
    return inserted;
  } catch (err) {
    const cause =
      err && typeof err === "object" && "cause" in err
        ? (err as { cause: unknown }).cause
        : undefined;

    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      throw new CheckinError("ALREADY_CHECKED_IN");
    }
    throw err;
  }
}
