import { Elysia, t } from "elysia";
import { createSelectSchema } from "drizzle-typebox";

import { walkRallyActivities, walkRallyAttendances, walkRallyRegistrations } from "@src/db/schema";
import { spread } from "@src/utils/drizzle-typebox";

const _activity = createSelectSchema(walkRallyActivities);
const activity = t.Object(spread(_activity));

const _registration = createSelectSchema(walkRallyRegistrations);
const registration = t.Object(spread(_registration));

const _attendance = createSelectSchema(walkRallyAttendances);
const attendance = t.Object(spread(_attendance));

const round = t.Object({
  round: t.Integer({ title: "Round" }),
  start: t.String({ title: "Start Time", description: "HH:mm" }),
  end: t.String({ title: "End Time", description: "HH:mm" }),
  count: t.Integer({ title: "Registered Count" }),
  conflict: t.Optional(
    t.Object({ code: t.String({ title: "Activity Code" }) }, { title: "Conflicting Activity" })
  )
});

const myRegistration = t.Object({
  code: t.String({ title: "Activity Code" }),
  round: t.Integer({ title: "Round" }),
  start: t.String({ title: "Start Time", description: "HH:mm" }),
  end: t.String({ title: "End Time", description: "HH:mm" }),
  place: t.Integer({
    title: "Place",
    description: "1-based registration order within the (activity, round) slot"
  })
});

const checkAttendance = t.Object({
  scannedAt: t.Date({ title: "Scanned At" }),
  scannedBy: t.String({ format: "uuid", title: "Scanned By (Staff ID)" })
});

export const WalkRallyModel = new Elysia().model({
  activity,
  registration,
  attendance,
  activityCodeParams: t.Object({
    code: t.String({ title: "Activity Code" })
  }),
  getActivityRoundsResponse: t.Object({
    rounds: t.Array(round),
    registeredRound: t.Boolean({
      title: "Registered Round",
      description: "True if the student already holds a registration for this activity, any round."
    })
  }),
  getMeResponse: t.Object({
    points: t.Integer({
      title: "Points",
      description: "Count of the student's walk_rally_attendances rows"
    }),
    registrations: t.Array(myRegistration)
  }),
  registerActivityBody: t.Object({
    code: t.String({ minLength: 1, title: "Activity Code" }),
    round: t.Integer({ minimum: 1, maximum: 6, title: "Round" })
  }),
  registerActivityResponse: t.Object({
    code: t.String({ title: "Activity Code" }),
    round: t.Integer({ title: "Round" })
  }),
  unregisterActivityResponse: t.Object({
    code: t.String({ title: "Activity Code" })
  }),
  changeRoundBody: t.Object({
    round: t.Integer({ minimum: 1, maximum: 6, title: "Round" })
  }),
  checkAttendance,
  checkAttendanceBody: t.Object({
    studentId: t.String({
      minLength: 1,
      title: "Student ID",
      description: "CUNET id, from QR scan"
    }),
    code: t.String({ minLength: 1, title: "Activity Code" })
  }),
  checkAttendanceResponse: t.Object({
    studentId: t.String({ format: "uuid", title: "Student ID" }),
    activityId: t.String({ format: "uuid", title: "Activity ID" }),
    scannedAt: t.Date({ title: "Scanned At" }),
    scannedBy: t.String({ format: "uuid", title: "Scanned By (Staff ID)" })
  })
});
