import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";

import { attendanceSourceEnum, walkRallyKindEnum } from "./enums";
import { id, timestamps } from "./helper";
import { students } from "./identity.schema";

// 8 seeded activities (3 workshops, 4 museums, 1 minigame). names/desc in frontend i18n — only code here.
// rounds/times/capacity live in app config (WALK_RALLY), not the DB.
export const walkRallyActivities = t.pgTable("walk_rally_activities", {
  ...id,
  code: t.text("code").notNull().unique(),
  kind: walkRallyKindEnum("kind").notNull(),
  ...timestamps
});

// slot pre-registration (intent; editable until regClose). capacity (30/slot) enforced
// in a transaction at insert time — no capacity column.
export const walkRallyRegistrations = t.pgTable(
  "walk_rally_registrations",
  {
    ...id,
    studentId: t
      .uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    activityId: t
      .uuid("activity_id")
      .notNull()
      .references(() => walkRallyActivities.id, { onDelete: "restrict" }),
    round: t.integer("round").notNull(),
    ...timestamps
  },
  (table) => [
    t
      .unique("walk_rally_registrations_student_activity_unique")
      .on(table.studentId, table.activityId),
    // all activities share the 6 round times -> same round twice = overlap
    t.unique("walk_rally_registrations_student_round_unique").on(table.studentId, table.round),
    t.index("walk_rally_registrations_activity_round_idx").on(table.activityId, table.round),
    t.check("walk_rally_registrations_round_check", sql`${table.round} between 1 and 6`)
  ]
);

// attendance fact (staff scan after the slot; immutable). walk-in OK — registration never
// checked at scan. points = row count per student; one point per activity via the unique.
export const walkRallyAttendances = t.pgTable(
  "walk_rally_attendances",
  {
    ...id,
    studentId: t
      .uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    activityId: t
      .uuid("activity_id")
      .notNull()
      .references(() => walkRallyActivities.id, { onDelete: "restrict" }),
    scannedBy: t
      .uuid("scanned_by")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    scannedAt: t.timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
    source: attendanceSourceEnum("source").notNull(),
    ...timestamps
  },
  (table) => [
    t
      .unique("walk_rally_attendances_student_activity_unique")
      .on(table.studentId, table.activityId),
    t.index("walk_rally_attendances_student_id_idx").on(table.studentId)
  ]
);

export type WalkRallyActivity = typeof walkRallyActivities.$inferSelect;
export type NewWalkRallyActivity = typeof walkRallyActivities.$inferInsert;
export type WalkRallyRegistration = typeof walkRallyRegistrations.$inferSelect;
export type NewWalkRallyRegistration = typeof walkRallyRegistrations.$inferInsert;
export type WalkRallyAttendance = typeof walkRallyAttendances.$inferSelect;
export type NewWalkRallyAttendance = typeof walkRallyAttendances.$inferInsert;
