import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";

import { destinationEnum, originEnum, projectEnum, roleEnum, vehicleEnum } from "./enums";
import { id, timestamps } from "./helper";
import { groups } from "./houses.schema";

// one person, shared by both projects. student_id (CUNET) = QR payload + SSO upsert key.
// year-one is derived (student_id LIKE '69%'), never stored.
export const students = t.pgTable(
  "students",
  {
    ...id,
    studentId: t.text("student_id").notNull().unique(),
    // case-insensitive unique (see config below) — "A@x.com" and "a@x.com" are the same person.
    email: t.text("email").notNull(),
    firstName: t.text("first_name").notNull(),
    lastName: t.text("last_name").notNull(),
    nickname: t.text("nickname"),
    faculty: t.text("faculty"),
    department: t.text("department"),
    year: t.text("year"),
    phone: t.text("phone"),
    lineId: t.text("line_id"),
    emergencyContactName: t.text("emergency_contact_name"),
    emergencyContactPhone: t.text("emergency_contact_phone"),
    allergies: t.text("allergies"),
    dietary: t.text("dietary"),
    medicalNotes: t.text("medical_notes"),
    role: roleEnum("role").notNull().default("student"),
    ...timestamps
  },
  (table) => [t.uniqueIndex("students_email_unique").on(sql`lower(${table.email})`)]
);

// one row per (student, project). attendedDays + groupId are rpkm-only (null on firstdate).
// groupId = membership, no join table; set null on group delete so members aren't orphaned.
export const registrations = t.pgTable(
  "registrations",
  {
    ...id,
    studentId: t
      .uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    project: projectEnum("project").notNull(),
    pdpaAcceptedAt: t.timestamp("pdpa_accepted_at", { withTimezone: true }).notNull(),
    attendedDays: t.integer("attended_days"),
    groupId: t.uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => [
    t.unique("registrations_student_project_unique").on(table.studentId, table.project),
    t.index("registrations_group_id_idx").on(table.groupId)
  ]
);

// carbon: up to 2 legs per registration. each field is a code + a *_other free text for "อื่นๆ".
// the form's "ท่านเดินทางมาจากเขตใด" = leg 1's origin. no distance stored — choices only.
export const travelLegs = t.pgTable(
  "travel_legs",
  {
    ...id,
    registrationId: t
      .uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    seq: t.integer("seq").notNull(),
    vehicle: vehicleEnum("vehicle").notNull(),
    vehicleOther: t.text("vehicle_other"),
    origin: originEnum("origin").notNull(),
    originOther: t.text("origin_other"),
    destination: destinationEnum("destination").notNull(),
    destinationOther: t.text("destination_other"),
    ...timestamps
  },
  (table) => [
    t.unique("travel_legs_registration_seq_unique").on(table.registrationId, table.seq),
    t.index("travel_legs_registration_id_idx").on(table.registrationId),
    t.check("travel_legs_seq_check", sql`${table.seq} in (1, 2)`),
    // *_other free-text is required iff the code is 'other', and forbidden otherwise.
    t.check(
      "travel_legs_vehicle_other_check",
      sql`(${table.vehicle} = 'other') = (${table.vehicleOther} is not null)`
    ),
    t.check(
      "travel_legs_origin_other_check",
      sql`(${table.origin} = 'other') = (${table.originOther} is not null)`
    ),
    t.check(
      "travel_legs_destination_other_check",
      sql`(${table.destination} = 'other') = (${table.destinationOther} is not null)`
    )
  ]
);

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;
export type TravelLeg = typeof travelLegs.$inferSelect;
export type NewTravelLeg = typeof travelLegs.$inferInsert;
