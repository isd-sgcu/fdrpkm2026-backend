import * as t from "drizzle-orm/pg-core";

import { gameEnum } from "./enums";
import { id, timestamps } from "./helper";
import { students } from "./identity.schema";

// static QR points. code = QR payload; game is a label (not an FK).
// lat/lng + geofenceRadiusM drive the optional GPS gate. place names live in frontend i18n.
export const checkpoints = t.pgTable("checkpoints", {
  ...id,
  game: gameEnum("game").notNull(),
  code: t.text("code").notNull().unique(),
  lat: t.doublePrecision("lat"),
  lng: t.doublePrecision("lng"),
  geofenceRadiusM: t.integer("geofence_radius_m").notNull().default(50),
  ...timestamps
});

// self-scan log, one credit per (checkpoint, student). lat/lng always stored, range-checked
// only when the game's requireGps config is on. stats = count(distinct checkpoint) per student by game.
export const scans = t.pgTable(
  "scans",
  {
    ...id,
    checkpointId: t
      .uuid("checkpoint_id")
      .notNull()
      .references(() => checkpoints.id, { onDelete: "restrict" }),
    studentId: t
      .uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    scannedAt: t.timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
    lat: t.doublePrecision("lat"),
    lng: t.doublePrecision("lng"),
    ...timestamps
  },
  (table) => [
    t.unique("scans_checkpoint_student_unique").on(table.checkpointId, table.studentId),
    t.index("scans_student_id_idx").on(table.studentId)
  ]
);

export type Checkpoint = typeof checkpoints.$inferSelect;
export type NewCheckpoint = typeof checkpoints.$inferInsert;
export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;
