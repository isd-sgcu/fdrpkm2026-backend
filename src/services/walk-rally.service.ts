import { and, eq, sql } from "drizzle-orm";

import { db as defaultDb, type Database } from "@src/db";
import {
  students,
  walkRallyActivities,
  walkRallyAttendances,
  walkRallyRegistrations
} from "@src/db/schema";
import type { AppErrorCode } from "@src/utils";
import { isEventActive, isEventPassed } from "@src/utils/flags";
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

/** @desc `Database` or the `tx` a transaction callback receives — both support the query builder calls the helpers below use. */
type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * @desc Shared by registerForActivity and changeRound. Throws if `studentId`
 * holds a registration whose round number matches `targetRound`, or whose
 * time (on *its own* activity's schedule) overlaps `[targetStart, targetEnd)`.
 * Must run against the same `tx` the caller locked the student's row in.
 */
const assertNoRoundConflict = async (
  database: Executor,
  studentId: string,
  targetRound: number,
  targetStart: number,
  targetEnd: number
): Promise<void> => {
  const myRegistrations = await database
    .select({
      round: walkRallyRegistrations.round,
      activityCode: walkRallyActivities.code
    })
    .from(walkRallyRegistrations)
    .innerJoin(walkRallyActivities, eq(walkRallyRegistrations.activityId, walkRallyActivities.id))
    .where(eq(walkRallyRegistrations.studentId, studentId));

  const conflict = myRegistrations.some((r) => {
    if (r.round === targetRound) return true;
    const slot = WALK_RALLY.rounds[scheduleFor(r.activityCode)].find((s) => s.round === r.round)!;
    return overlaps(targetStart, targetEnd, toMinutes(slot.start), toMinutes(slot.end));
  });
  if (conflict) throw new WalkRallyServiceError("ROUND_CONFLICT");
};

/**
 * @desc Shared by registerForActivity and changeRound. Inserts a (student, activity, round) row
 * Returns `undefined` if (student_id, activity_id) already exists
 */
const insertRegistration = async (
  database: Executor,
  studentId: string,
  activityId: string,
  round: number
) => {
  const [inserted] = await database
    .insert(walkRallyRegistrations)
    .values({ studentId, activityId, round })
    .onConflictDoNothing({
      target: [walkRallyRegistrations.studentId, walkRallyRegistrations.activityId]
    })
    .returning();
  return inserted;
};

/**
 * @desc Shared by unregisterFromActivity and changeRound. Deletes the
 * student's registration row for one activity (any round). Returns the
 * deleted row, or `undefined` if there was none.
 */
const deleteRegistration = async (database: Executor, studentId: string, activityId: string) => {
  const [deleted] = await database
    .delete(walkRallyRegistrations)
    .where(
      and(
        eq(walkRallyRegistrations.studentId, studentId),
        eq(walkRallyRegistrations.activityId, activityId)
      )
    )
    .returning();
  return deleted;
};

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

/**
 * @name getMe
 * @api {GET} /walkrally/me
 * @desc The current student's walk rally points (attendance count) and
 * their registrations, each annotated with: start/end, round, place, the registration's 1-based order within its (activity, round) slot.
 * Registrations are ordered by upcoming activity — soonest start time first.
 * ---
 * @param studentId CUNET id (from authMiddleware)
 * @throws {WalkRallyServiceError} NOT_FOUND if the student can't be resolved
 */
type MyRegistration = {
  code: string;
  round: number;
  start: string;
  end: string;
  place: number;
};

const getMe = async (
  studentId: string,
  deps: WalkRallyDeps = {}
): Promise<{ points: number; registrations: MyRegistration[] }> => {
  const database = deps.db ?? defaultDb;
  const student = await resolveCurrentStudent(studentId, deps);

  const [pointsRow] = await database
    .select({ points: sql<number>`count(*)`.mapWith(Number) })
    .from(walkRallyAttendances)
    .where(eq(walkRallyAttendances.studentId, student.id));

  // Ranks every registration within its (activity, round) slot by signup order
  const ranked = database.$with("ranked").as(
    database
      .select({
        studentId: walkRallyRegistrations.studentId,
        round: walkRallyRegistrations.round,
        activityCode: walkRallyActivities.code,
        place: sql<number>`row_number() over (
          partition by ${walkRallyRegistrations.activityId}, ${walkRallyRegistrations.round}
          order by ${walkRallyRegistrations.createdAt}, ${walkRallyRegistrations.id}
        )`
          .mapWith(Number)
          .as("place")
      })
      .from(walkRallyRegistrations)
      .innerJoin(walkRallyActivities, eq(walkRallyRegistrations.activityId, walkRallyActivities.id))
  );

  const rows = await database
    .with(ranked)
    .select({ code: ranked.activityCode, round: ranked.round, place: ranked.place })
    .from(ranked)
    .where(eq(ranked.studentId, student.id));

  // Ranked by upcoming activity
  const registrations: MyRegistration[] = rows
    .map((r) => {
      const slot = WALK_RALLY.rounds[scheduleFor(r.code)].find((s) => s.round === r.round)!;
      return { code: r.code, round: r.round, start: slot.start, end: slot.end, place: r.place };
    })
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  return { points: pointsRow.points, registrations };
};

/**
 * @name registerForActivity
 * @api {POST} /walkrally/registrations
 * @desc Registers the current student into round of activity.
 * ---
 * @param studentId CUNET id (from authMiddleware)
 * @param input `code` (walk_rally_activities.code) and `round` (1-6)
 * @throws {WalkRallyServiceError} REGISTRATION_CLOSED if outside the
 *   regOpen/regClose window, NOT_FOUND if the student can't be resolved,
 *   INVALID_ACTIVITY, ROUND_CONFLICT, ACTIVITY_ALREADY_REGISTERED
 */
type RegisterInput = { code: string; round: number };

const registerForActivity = async (
  studentId: string,
  input: RegisterInput,
  deps: WalkRallyDeps = {}
): Promise<{ code: string; round: number }> => {
  if (!isEventActive("rpkm_walkrally_registration"))
    throw new WalkRallyServiceError("REGISTRATION_CLOSED");

  const database = deps.db ?? defaultDb;
  const student = await resolveCurrentStudent(studentId, deps);

  const [activity] = await database
    .select()
    .from(walkRallyActivities)
    .where(eq(walkRallyActivities.code, input.code));
  if (!activity) throw new WalkRallyServiceError("INVALID_ACTIVITY");

  const targetSlot = WALK_RALLY.rounds[scheduleFor(activity.code)].find(
    (s) => s.round === input.round
  )!;
  const targetStart = toMinutes(targetSlot.start);
  const targetEnd = toMinutes(targetSlot.end);

  return database.transaction(async (tx) => {
    await tx.select().from(students).where(eq(students.id, student.id)).for("update");

    await assertNoRoundConflict(tx, student.id, input.round, targetStart, targetEnd);

    const inserted = await insertRegistration(tx, student.id, activity.id, input.round);
    if (!inserted) throw new WalkRallyServiceError("ACTIVITY_ALREADY_REGISTERED");

    return { code: activity.code, round: inserted.round };
  });
};

/**
 * @name unregisterFromActivity
 * @api {DELETE} /walkrally/registrations/:code
 * @desc Cancels the current student's registration for activity.
 * ---
 * @param studentId CUNET id (from authMiddleware)
 * @param activityCode `walk_rally_activities.code`
 * @throws {WalkRallyServiceError} REGISTRATION_CLOSED if past regClose,
 *   NOT_FOUND if the student can't be resolved or holds no registration for
 *   this activity, INVALID_ACTIVITY
 */
const unregisterFromActivity = async (
  studentId: string,
  activityCode: string,
  deps: WalkRallyDeps = {}
): Promise<{ code: string }> => {
  if (isEventPassed("rpkm_walkrally_registration"))
    throw new WalkRallyServiceError("REGISTRATION_CLOSED");

  const database = deps.db ?? defaultDb;
  const student = await resolveCurrentStudent(studentId, deps);

  const [activity] = await database
    .select()
    .from(walkRallyActivities)
    .where(eq(walkRallyActivities.code, activityCode));
  if (!activity) throw new WalkRallyServiceError("INVALID_ACTIVITY");

  const deleted = await deleteRegistration(database, student.id, activity.id);
  if (!deleted) throw new WalkRallyServiceError("NOT_FOUND");

  return { code: activity.code };
};

/**
 * @name changeRound
 * @api {PATCH} /walkrally/registrations/:code
 * @desc change round of the activity registration.
 * logic: delete the old regis, then insert a new regis because the created_at timestamp is used to determine the place of the registration.
 * ---
 * @param studentId CUNET id (from authMiddleware)
 * @param activityCode `walk_rally_activities.code`
 * @param round requested round (1-6)
 * @throws {WalkRallyServiceError} REGISTRATION_CLOSED if outside the
 *   regOpen/regClose window, NOT_FOUND if the student can't be resolved or
 *   holds no registration for this activity, INVALID_ACTIVITY, ROUND_CONFLICT
 */
const changeRound = async (
  studentId: string,
  activityCode: string,
  round: number,
  deps: WalkRallyDeps = {}
): Promise<{ code: string; round: number }> => {
  if (!isEventActive("rpkm_walkrally_registration"))
    throw new WalkRallyServiceError("REGISTRATION_CLOSED");

  const database = deps.db ?? defaultDb;
  const student = await resolveCurrentStudent(studentId, deps);

  const [activity] = await database
    .select()
    .from(walkRallyActivities)
    .where(eq(walkRallyActivities.code, activityCode));
  if (!activity) throw new WalkRallyServiceError("INVALID_ACTIVITY");

  const targetSlot = WALK_RALLY.rounds[scheduleFor(activity.code)].find((s) => s.round === round)!;
  const targetStart = toMinutes(targetSlot.start);
  const targetEnd = toMinutes(targetSlot.end);

  // update the registration row in a transaction
  return database.transaction(async (tx) => {
    await tx.select().from(students).where(eq(students.id, student.id)).for("update");

    const [own] = await tx
      .select()
      .from(walkRallyRegistrations)
      .where(
        and(
          eq(walkRallyRegistrations.studentId, student.id),
          eq(walkRallyRegistrations.activityId, activity.id)
        )
      );
    if (!own) throw new WalkRallyServiceError("NOT_FOUND");

    // Check if the requested round is the same as the current round.
    if (own.round === round) return { code: activity.code, round };

    await deleteRegistration(tx, student.id, activity.id);

    // Check for round conflicts with the new requested round. if there is a conflict, the transaction will be rolled back and the original registration will remain intact.
    await assertNoRoundConflict(tx, student.id, round, targetStart, targetEnd);

    const inserted = await insertRegistration(tx, student.id, activity.id, round);
    return { code: activity.code, round: inserted!.round };
  });
};

// Namespace object — routes call `WalkRallyService.<fn>(...)` instead of
export const WalkRallyService = {
  WalkRallyServiceError,
  getActivityRounds,
  getMe,
  registerForActivity,
  unregisterFromActivity,
  changeRound
};
