import { eq, sql } from "drizzle-orm";

import { db as defaultDb, type Database } from "@src/db";
import { students, walkRallyActivities, walkRallyRegistrations } from "@src/db/schema";
import type { AppErrorCode } from "@src/utils";
import { WALK_RALLY } from "@src/constants";

// Constant
export type WalkRallyDeps = { db?: Database };

/** Thrown on expected business failures; controller maps `code` to an HTTP status. */
class WalkRallyServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

// Helper function
/**
 * @desc Resolves the `students` row for a CUNET id.
 * @param studentId CUNET id, as derived by authMiddleware from the session email
 * @throws {WalkRallyServiceError} NOT_FOUND if no `students` row matches
 */
const resolveCurrentStudent = async (studentId: string, deps: WalkRallyDeps = {}) => {
  const database = deps.db ?? defaultDb;
  const [student] = await database.select().from(students).where(eq(students.studentId, studentId));
  if (!student) throw new WalkRallyServiceError("NOT_FOUND");
  return student;
};

/** @desc Every activity runs on the "default" schedule except "cu_museum". */
const scheduleFor = (activityCode: string): keyof typeof WALK_RALLY.rounds =>
  activityCode === "cu_museum" ? "cu_museum" : "default";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** @desc End-exclusive overlap: touching slots (one's end == other's start) don't conflict. */
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

// Service functions
/**
 * @name getActivityRounds
 * @api {GET} /walkrally/activities/:code/rounds
 * @desc Gets all rounds from code activity by annotated following:
 * - display registered round
 * - display disabled round if the student has a time-overlapping registration for a different activity
 * ---
 * @param studentId CUNET id (from authMiddleware)
 * @param activityCode `walk_rally_activities.code`
 * @throws {WalkRallyServiceError} NOT_FOUND if the student can't be resolved, INVALID_ACTIVITY
 */
type RoundInfo = {
  round: number;
  start: string;
  end: string;
  count: number;
  conflict?: { code: string };
};

const getActivityRounds = async (
  studentId: string,
  activityCode: string,
  deps: WalkRallyDeps = {}
): Promise<{ rounds: RoundInfo[]; registeredRound: boolean }> => {
  const database = deps.db ?? defaultDb;
  const student = await resolveCurrentStudent(studentId, deps);

  const [activity] = await database
    .select()
    .from(walkRallyActivities)
    .where(eq(walkRallyActivities.code, activityCode));
  if (!activity) throw new WalkRallyServiceError("INVALID_ACTIVITY");

  // Fetch every registration this student has across all activities
  const myRegistrations = await database
    .select({
      round: walkRallyRegistrations.round,
      activityId: walkRallyRegistrations.activityId,
      activityCode: walkRallyActivities.code
    })
    .from(walkRallyRegistrations)
    .innerJoin(walkRallyActivities, eq(walkRallyRegistrations.activityId, walkRallyActivities.id))
    .where(eq(walkRallyRegistrations.studentId, student.id));

  const activityAlreadyRegistered = myRegistrations.some((r) => r.activityId === activity.id);

  // Registered count per round, for this activity only
  const countRows = await database
    .select({
      round: walkRallyRegistrations.round,
      count: sql<number>`count(*)`.mapWith(Number)
    })
    .from(walkRallyRegistrations)
    .where(eq(walkRallyRegistrations.activityId, activity.id))
    .groupBy(walkRallyRegistrations.round);
  const countByRound = new Map(countRows.map((r) => [r.round, r.count]));

  // The student's other bookings, resolved to actual time slots on their own schedule once
  // reused for every round below instead of re-resolving
  const otherBookings = myRegistrations
    .filter((r) => r.activityId !== activity.id)
    .map((r) => {
      const slot = WALK_RALLY.rounds[scheduleFor(r.activityCode)].find((s) => s.round === r.round)!;
      return {
        start: toMinutes(slot.start),
        end: toMinutes(slot.end),
        activityCode: r.activityCode
      };
    });

  const rounds = WALK_RALLY.rounds[scheduleFor(activityCode)].map((round) => {
    const roundStart = toMinutes(round.start);
    const roundEnd = toMinutes(round.end);
    const count = countByRound.get(round.round) ?? 0;

    // time overlap checking.
    const conflict = otherBookings.find((b) => overlaps(roundStart, roundEnd, b.start, b.end));

    return {
      ...round,
      count,
      conflict: conflict ? { code: conflict.activityCode } : undefined
    };
  });

  return {
    rounds,
    registeredRound: activityAlreadyRegistered
  };
};

// Namespace object — routes call `WalkRallyService.<fn>(...)` instead of
export const WalkRallyService = {
  WalkRallyServiceError,
  getActivityRounds
};
