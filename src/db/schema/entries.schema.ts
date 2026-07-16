import * as t from "drizzle-orm/pg-core";

import { id, timestamps } from "./helper";
import { students } from "./identity.schema";
import { projectEnum } from "./enums";

// event entry scan: staff scans the น้อง (or types student_id on fail). one row per (project, student).
// not the same as scans (the games) — staff-scans-participant vs น้อง-self-scans-point.
export const entries = t.pgTable(
  "entries",
  {
    ...id,
    project: projectEnum("project").notNull().default("firstdate"),
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
  (table) => [t.unique("entries_project_student_unique").on(table.project, table.studentId)]
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
