import { eq, and } from "drizzle-orm";
import type { Database } from "@src/db";
import { entries, students, type NewEntry } from "@src/db/schema";
import type { AppErrorCode } from "@src/utils";

/**
 * Shared logic for "staff scans student" flows, used by both
 * RpkmService and FirstDateService. Not called directly by routes.
 */

export class CheckinError extends Error {
  constructor(
    public code: AppErrorCode,
    public context?: Record<string, unknown>
  ) {
    super(code);
  }
}

type CheckinProject = "rpkm" | "freshmennight" | "firstdate";

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
  if (!staff || staff.role !== "staff") throw new CheckinError("FORBIDDEN_NOT_STAFF");
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

    throw new CheckinError("ALREADY_CHECKED_IN", {
      scannedAt: existing.scannedAt,
      scannedBy: existing.scannedBy
    });
  }

  return inserted;
}
