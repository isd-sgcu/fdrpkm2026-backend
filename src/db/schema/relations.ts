import { relations } from "drizzle-orm";

import { entries } from "./entries.schema";
import { checkpoints, scans } from "./games.schema";
import { groupHouseChoices, groups, houses } from "./houses.schema";
import { registrations, students, travelLegs } from "./identity.schema";
import {
  walkRallyActivities,
  walkRallyAttendances,
  walkRallyRegistrations
} from "./walk-rally.schema";

export const studentsRelations = relations(students, ({ many }) => ({
  registrations: many(registrations),
  groupsLed: many(groups, { relationName: "groupLeader" }),
  // entries has 2 FKs to students -> both reverse sides need a relationName.
  // entrant is unique per (project, student); drizzle's reverse is many() -> one row per project.
  entriesAsEntrant: many(entries, { relationName: "entrant" }),
  entriesScanned: many(entries, { relationName: "scanner" }),
  scans: many(scans),
  walkRallyRegistrations: many(walkRallyRegistrations),
  // walk_rally_attendances has 2 FKs to students -> both reverse sides need a relationName.
  walkRallyAttendances: many(walkRallyAttendances, { relationName: "walkRallyAttendee" }),
  walkRallyAttendancesScanned: many(walkRallyAttendances, { relationName: "walkRallyScanner" })
}));

export const registrationsRelations = relations(registrations, ({ one, many }) => ({
  student: one(students, { fields: [registrations.studentId], references: [students.id] }),
  group: one(groups, { fields: [registrations.groupId], references: [groups.id] }),
  travelLegs: many(travelLegs)
}));

export const travelLegsRelations = relations(travelLegs, ({ one }) => ({
  registration: one(registrations, {
    fields: [travelLegs.registrationId],
    references: [registrations.id]
  })
}));

export const entriesRelations = relations(entries, ({ one }) => ({
  student: one(students, {
    fields: [entries.studentId],
    references: [students.id],
    relationName: "entrant"
  }),
  scannedBy: one(students, {
    fields: [entries.scannedBy],
    references: [students.id],
    relationName: "scanner"
  })
}));

export const checkpointsRelations = relations(checkpoints, ({ many }) => ({
  scans: many(scans)
}));

export const scansRelations = relations(scans, ({ one }) => ({
  checkpoint: one(checkpoints, { fields: [scans.checkpointId], references: [checkpoints.id] }),
  student: one(students, { fields: [scans.studentId], references: [students.id] })
}));

export const housesRelations = relations(houses, ({ many }) => ({
  assignedGroups: many(groups),
  houseChoices: many(groupHouseChoices)
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  leader: one(students, {
    fields: [groups.leaderId],
    references: [students.id],
    relationName: "groupLeader"
  }),
  assignedHouse: one(houses, { fields: [groups.assignedHouseId], references: [houses.id] }),
  members: many(registrations),
  houseChoices: many(groupHouseChoices)
}));

export const groupHouseChoicesRelations = relations(groupHouseChoices, ({ one }) => ({
  group: one(groups, { fields: [groupHouseChoices.groupId], references: [groups.id] }),
  house: one(houses, { fields: [groupHouseChoices.houseId], references: [houses.id] })
}));

export const walkRallyActivitiesRelations = relations(walkRallyActivities, ({ many }) => ({
  registrations: many(walkRallyRegistrations),
  attendances: many(walkRallyAttendances)
}));

export const walkRallyRegistrationsRelations = relations(walkRallyRegistrations, ({ one }) => ({
  student: one(students, {
    fields: [walkRallyRegistrations.studentId],
    references: [students.id]
  }),
  activity: one(walkRallyActivities, {
    fields: [walkRallyRegistrations.activityId],
    references: [walkRallyActivities.id]
  })
}));

export const walkRallyAttendancesRelations = relations(walkRallyAttendances, ({ one }) => ({
  student: one(students, {
    fields: [walkRallyAttendances.studentId],
    references: [students.id],
    relationName: "walkRallyAttendee"
  }),
  activity: one(walkRallyActivities, {
    fields: [walkRallyAttendances.activityId],
    references: [walkRallyActivities.id]
  }),
  scannedBy: one(students, {
    fields: [walkRallyAttendances.scannedBy],
    references: [students.id],
    relationName: "walkRallyScanner"
  })
}));
