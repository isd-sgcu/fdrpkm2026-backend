import { and, eq } from "drizzle-orm";

import { db as defaultDb, type Database } from "@src/db";
import { checkpoints, scans, students } from "@src/db/schema";
import type { AppErrorCode } from "@src/utils";
import { isEventActive } from "@src/utils/flags";

// Constant
export type GamesDeps = { db?: Database };

const GAME_TYPES = ["jigsaw", "csr"] as const;
export type GameType = (typeof GAME_TYPES)[number];

const isGameType = (value: string): value is GameType =>
  (GAME_TYPES as readonly string[]).includes(value);

const EARTH_RADIUS_M = 6371000;

const EVENT_BY_GAME: Record<GameType, "rpkm_jigsaw" | "rpkm_csr"> = {
  jigsaw: "rpkm_jigsaw",
  csr: "rpkm_csr"
};

/** Thrown on expected business failures; controller maps `code` to an HTTP status. */
class GamesServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

// Helper function
/** @throws {GamesServiceError} INVALID_GAME_TYPE if not "jigsaw" or "csr" */
const assertValidGameType = (gameType: string): GameType => {
  if (!isGameType(gameType)) throw new GamesServiceError("INVALID_GAME_TYPE");
  return gameType;
};

/** @desc Great-circle distance in meters between two lat/lng points. */
const distanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

/**
 * @desc Resolves the `students` row for a CUNET id.
 * @param studentId CUNET id, as derived by authMiddleware from the session email
 * @throws {GamesServiceError} NOT_FOUND if no `students` row matches
 */
const resolveCurrentStudent = async (studentId: string, deps: GamesDeps = {}) => {
  const database = deps.db ?? defaultDb;
  const [student] = await database.select().from(students).where(eq(students.studentId, studentId));
  if (!student) throw new GamesServiceError("NOT_FOUND");
  return student;
};

// Service functions
/**
 * @name getProgress
 * @api {GET} /game/:gameType/progress
 * @desc All checkpoints the student has collected both jigsaw and CSR
 * ---
 * @param studentId CUNET id (from authMiddleware)
 * @param gameType raw `:gameType` path segment
 * @throws {GamesServiceError} INVALID_GAME_TYPE, NOT_FOUND if the student can't be resolved
 */
type CollectedCheckpoint = {
  checkpointId: string;
  code: string;
  game: GameType;
  scannedAt: Date;
};

const getProgress = async (
  studentId: string,
  gameType: string,
  deps: GamesDeps = {}
): Promise<{ collected: CollectedCheckpoint[] }> => {
  assertValidGameType(gameType);
  const database = deps.db ?? defaultDb;
  const student = await resolveCurrentStudent(studentId, deps);

  const rows = await database
    .select({
      checkpointId: checkpoints.id,
      code: checkpoints.code,
      game: checkpoints.game,
      scannedAt: scans.scannedAt
    })
    .from(scans)
    .innerJoin(checkpoints, eq(scans.checkpointId, checkpoints.id))
    .where(eq(scans.studentId, student.id));

  // walk rally checkpoints (if any exist) belong to a separate feature.
  const collected = rows.filter((row): row is CollectedCheckpoint => isGameType(row.game));

  return { collected };
};

/**
 * @name collectCheckpoint
 * @api {POST} /game/:gameType/collect
 * @desc Records a checkpoint scan for the freshman
 * ---
 * @param studentId CUNET id (from authMiddleware)
 * @param gameType raw `:gameType` path segment
 * @param input scanned `code` plus the device's `lat`/`lng`
 * @throws {GamesServiceError} INVALID_GAME_TYPE, GAME_CLOSED, NOT_FOUND if the student
 * can't be resolved, INVALID_CHECKPOINT, OUT_OF_GEOFENCE, or ALREADY_COLLECTED
 */
type CollectInput = { code: string; lat: number; lng: number };

const collectCheckpoint = async (
  studentId: string,
  gameType: string,
  input: CollectInput,
  deps: GamesDeps = {}
): Promise<{ checkpointId: string; code: string; scannedAt: Date }> => {
  const game = assertValidGameType(gameType);
  if (!isEventActive(EVENT_BY_GAME[game])) throw new GamesServiceError("GAME_CLOSED");

  const database = deps.db ?? defaultDb;
  const student = await resolveCurrentStudent(studentId, deps);

  // check checkpoint code exists
  const [checkpoint] = await database
    .select()
    .from(checkpoints)
    .where(and(eq(checkpoints.game, game), eq(checkpoints.code, input.code)));
  if (!checkpoint) throw new GamesServiceError("INVALID_CHECKPOINT");

  // check coordinates are within the checkpoint's geofence radius
  if (checkpoint.lat !== null && checkpoint.lng !== null) {
    const distance = distanceMeters(input.lat, input.lng, checkpoint.lat, checkpoint.lng);
    if (distance > checkpoint.geofenceRadiusM) throw new GamesServiceError("OUT_OF_GEOFENCE");
  }

  // onConflictDoNothing against scans_checkpoint_student_unique closes the
  // race window a separate pre-check select would leave open.
  const [scan] = await database
    .insert(scans)
    .values({
      checkpointId: checkpoint.id,
      studentId: student.id,
      lat: input.lat,
      lng: input.lng
    })
    .onConflictDoNothing({ target: [scans.checkpointId, scans.studentId] })
    .returning();
  if (!scan) throw new GamesServiceError("ALREADY_COLLECTED");

  return { checkpointId: checkpoint.id, code: checkpoint.code, scannedAt: scan.scannedAt };
};

// Namespace object — routes call `GamesService.<fn>(...)` instead of
export const GamesService = {
  GamesServiceError,
  getProgress,
  collectCheckpoint
};
