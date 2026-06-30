import * as t from "drizzle-orm/pg-core";

import { id, timestamps } from "./helper";
import { students } from "./identity.schema";

// firstdate entry scan: staff scans the น้อง (or types student_id on fail). one row per student.
// not the same as scans (the games) — staff-scans-participant vs น้อง-self-scans-point.
export const fdEntries = t.pgTable(
  "fd_entries",
  {
    ...id,
    studentId: t
      .uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    scannedBy: t
      .uuid("scanned_by")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    scannedAt: t.timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps
  },
  (table) => [t.unique("fd_entries_student_unique").on(table.studentId)]
);

export type FdEntry = typeof fdEntries.$inferSelect;
export type NewFdEntry = typeof fdEntries.$inferInsert;
