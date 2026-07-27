import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db as defaultDb, type Database } from "@src/db";
import { generateJoinCode, MAX_JOIN_CODE_ATTEMPTS } from "@src/utils";
import { ROUND2_HOUSE_CODES } from "@src/constants";
import {
  groupHouseChoices,
  groups,
  houses,
  registrations,
  students,
  user,
  type Group,
  type GroupHouseChoice,
  type Student
} from "@src/db/schema";
import { AppError, isFreshman } from "@src/utils";
import { isEventActive, isEventPassed } from "@src/utils/flags";

export type GroupsDeps = { db?: Database };

type GroupMember = {
  userId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  isLeader: boolean;
  avatarUrl: string | null;
};

type GroupWithMembers = Group & { members: GroupMember[] };

// --- Helpers (private) ---

/**
 * Resolves the `students` row for a CUNET id.
 * @param studentId CUNET id, as derived by authMiddleware from the session email
 * @throws {AppError} NOT_FOUND if no `students` row matches
 */
const resolveCurrentStudent = async (
  studentId: string,
  deps: GroupsDeps = {}
): Promise<Student> => {
  const database = deps.db ?? defaultDb;
  const [student] = await database.select().from(students).where(eq(students.studentId, studentId));
  if (!student) throw new AppError("NOT_FOUND");
  return student;
};

/**
 * All members of a group, with `isLeader` set for the one matching `group.leaderId`.
 * @param group the group to list members for
 */
const getGroupMembers = async (group: Group, deps: GroupsDeps = {}): Promise<GroupMember[]> => {
  const database = deps.db ?? defaultDb;
  const rows = await database
    .select({
      userId: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      nickname: students.nickname,
      avatarUrl: user.image
    })
    .from(registrations)
    .innerJoin(students, eq(registrations.studentId, students.id))
    // students <-> user (better-auth) has no FK, only a shared case-insensitive
    // email — same match rule as `students_email_unique`.
    .leftJoin(user, sql`lower(${user.email}) = lower(${students.email})`)
    .where(eq(registrations.groupId, group.id));

  return rows.map((row) => ({ ...row, isLeader: row.userId === group.leaderId }));
};

/**
 * A group row plus its members — the shape returned to `Groups.GroupWithMembers` callers.
 * @param group the group to attach members to
 */
const getGroupWithMembers = async (
  group: Group,
  deps: GroupsDeps = {}
): Promise<GroupWithMembers> => ({
  ...group,
  members: await getGroupMembers(group, deps)
});

/**
 * The student's rpkm registration — always exactly one once they've registered.
 * @param studentId `students.id` (uuid), not the CUNET id
 * @throws {AppError} NOT_FOUND if the student has no rpkm registration yet
 */
const getCurrentRegistration = async (studentId: string, deps: GroupsDeps = {}) => {
  const database = deps.db ?? defaultDb;
  const [registration] = await database
    .select()
    .from(registrations)
    .where(and(eq(registrations.studentId, studentId), eq(registrations.project, "rpkm")));
  if (!registration) throw new AppError("NOT_FOUND");
  return registration;
};

/**
 * Resolves student -> their rpkm registration -> the group it points to.
 * Shared by every endpoint that acts on "the caller's current group".
 * @param studentId CUNET id (from authMiddleware)
 * @throws {AppError} NOT_FOUND if the student, their registration, or their group can't be resolved
 */
const getCurrentGroup = async (studentId: string, deps: GroupsDeps = {}) => {
  const database = deps.db ?? defaultDb;
  const student = await resolveCurrentStudent(studentId, deps);
  const registration = await getCurrentRegistration(student.id, deps);
  if (!registration.groupId) throw new AppError("NOT_FOUND");

  const [group] = await database.select().from(groups).where(eq(groups.id, registration.groupId));
  if (!group) throw new AppError("NOT_FOUND");

  return { student, registration, group };
};

/**
 * Guards membership-changing ops (join/leave/kick/regenerate) against a
 * group that shouldn't be touched: a group that already has a house is
 * frozen forever; a houseless group unlocks during the round-2 pick window
 * regardless of a stale `confirmedAt` left over from round 1's post-draw
 * lock script, and re-locks automatically the instant round 1's window has
 * passed and round 2 isn't (yet, or anymore) active — covering both the
 * 21-28 Jul gap between rounds and the period after round 2 closes, with
 * no manual script needed for either.
 * @throws {AppError} ALREADY_CONFIRMED if the group has a house or a legacy
 *   round-1 lock; HOUSE_PICK_CLOSED if no round's pick window is currently open for it
 */
const assertGroupOpen = (group: Group) => {
  if (group.assignedHouseId) throw new AppError("ALREADY_CONFIRMED");
  if (isEventActive("rpkm_house_pick_round2")) return;
  if (group.confirmedAt) throw new AppError("ALREADY_CONFIRMED");
  if (isEventPassed("rpkm_house_pick")) throw new AppError("HOUSE_PICK_CLOSED");
};

/**
 * Which round's house preferences a leader is currently allowed to write.
 * @throws {AppError} HOUSE_PICK_CLOSED if neither round's pick window is open for this group
 */
const resolveWritableRound = (group: Group): 1 | 2 => {
  if (group.assignedHouseId) throw new AppError("HOUSE_PICK_CLOSED");
  if (isEventActive("rpkm_house_pick_round2")) return 2;
  if (isEventPassed("rpkm_house_pick_round2")) throw new AppError("HOUSE_PICK_CLOSED");
  if (isEventPassed("rpkm_house_pick")) throw new AppError("HOUSE_PICK_CLOSED");
  return 1;
};

/**
 * Which round's house preferences a caller should currently see: round 2 if
 * its window is open or the group already has round-2 picks on file, else round 1.
 */
const resolveReadableRound = async (group: Group, deps: GroupsDeps = {}): Promise<1 | 2> => {
  if (isEventActive("rpkm_house_pick_round2")) return 2;
  const database = deps.db ?? defaultDb;
  const [round2Choice] = await database
    .select({ id: groupHouseChoices.id })
    .from(groupHouseChoices)
    .where(and(eq(groupHouseChoices.groupId, group.id), eq(groupHouseChoices.round, 2)));
  return round2Choice ? 2 : 1;
};

// --- Public API (same order as the routes in src/routes/rpkm/groups.ts) ---

/**
 * Move the caller from their current group into the group identified by `joinCode`.
 * @param studentId CUNET id of the student joining (from authMiddleware)
 * @param joinCode 6-digit code identifying the target group
 * @throws {AppError} NOT_FRESHMEN, HOUSE_PICK_CLOSED, INVALID_JOIN_CODE, LEADER_HAS_MEMBERS, GROUP_FULL, or ALREADY_CONFIRMED
 */
const join = async (
  studentId: string,
  joinCode: string,
  deps: GroupsDeps = {}
): Promise<GroupWithMembers> => {
  const database = deps.db ?? defaultDb;
  if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
  const student = await resolveCurrentStudent(studentId, deps);

  const [targetGroup] = await database.select().from(groups).where(eq(groups.joinCode, joinCode));
  if (!targetGroup) throw new AppError("INVALID_JOIN_CODE");
  assertGroupOpen(targetGroup);

  const registration = await getCurrentRegistration(student.id, deps);
  const oldGroupId = registration.groupId;

  // already in this group — no-op success, skip leader/capacity checks and the write entirely.
  if (oldGroupId === targetGroup.id) return getGroupWithMembers(targetGroup, deps);

  if (oldGroupId) {
    const [oldGroup] = await database.select().from(groups).where(eq(groups.id, oldGroupId));
    if (oldGroup) assertGroupOpen(oldGroup);
    if (oldGroup && oldGroup.leaderId === student.id) {
      const oldMembers = await getGroupMembers(oldGroup, deps);
      // a solo leader (no one else yet) may still hop groups; only blocked once someone's joined them.
      if (oldMembers.length > 1) throw new AppError("LEADER_HAS_MEMBERS");
    }
  }

  const targetMembers = await getGroupMembers(targetGroup, deps);
  if (targetMembers.length >= 4) throw new AppError("GROUP_FULL");

  await database.transaction(async (tx) => {
    // Serialize concurrent joins to this group so the 4-member cap can't be
    // raced: lock the group row, then re-count members inside the tx. The
    // pre-tx check above is only a fast path.
    await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, targetGroup.id))
      .for("update");
    const currentMembers = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(eq(registrations.groupId, targetGroup.id));
    if (currentMembers.length >= 4) throw new AppError("GROUP_FULL");

    await tx
      .update(registrations)
      .set({ groupId: targetGroup.id })
      .where(eq(registrations.id, registration.id));

    if (oldGroupId && oldGroupId !== targetGroup.id) {
      const [remaining] = await tx
        .select()
        .from(registrations)
        .where(eq(registrations.groupId, oldGroupId));
      // old group has no one left in it (was solo) -> delete instead of leaving an orphan row.
      if (!remaining) await tx.delete(groups).where(eq(groups.id, oldGroupId));
    }
  });

  return getGroupWithMembers(targetGroup, deps);
};

/**
 * Current group + members for the logged-in student.
 * @param studentId CUNET id (from authMiddleware)
 * @throws {AppError} NOT_FOUND if the student or their group can't be resolved
 */
const getMyGroup = async (studentId: string, deps: GroupsDeps = {}): Promise<GroupWithMembers> => {
  const { group } = await getCurrentGroup(studentId, deps);
  return getGroupWithMembers(group, deps);
};

/**
 * The caller's group's ranked house choices, most preferred (rank 1) first.
 * @param studentId CUNET id (from authMiddleware)
 * @throws {AppError} NOT_FOUND if the student or their group can't be resolved
 */
const getHousePreferences = async (
  studentId: string,
  deps: GroupsDeps = {}
): Promise<{ housePreferences: GroupHouseChoice[] }> => {
  const database = deps.db ?? defaultDb;
  const { group } = await getCurrentGroup(studentId, deps);
  const round = await resolveReadableRound(group, deps);
  const housePreferences = await database
    .select()
    .from(groupHouseChoices)
    .where(and(eq(groupHouseChoices.groupId, group.id), eq(groupHouseChoices.round, round)))
    .orderBy(asc(groupHouseChoices.rank));

  return { housePreferences };
};

/**
 * Replace the caller's group's whole ranked house-choice set for whichever
 * round is currently open for them. Leader-only. Can be called any number
 * of times while that round's house-pick window is open. Round 2 additionally
 * restricts picks to {@link ROUND2_HOUSE_CODES}.
 * @param studentId CUNET id (from authMiddleware)
 * @param houseIds ranked house ids, most preferred first (rank = index + 1)
 * @throws {AppError} NOT_FOUND if the student/group can't be resolved,
 *   NOT_LEADER if not the group's leader, HOUSE_PICK_CLOSED if no pick window is
 *   currently open for this group, BAD_REQUEST if a houseId doesn't exist or
 *   (round 2 only) isn't in the round-2 house list
 */
const setHousePreferences = async (
  studentId: string,
  houseIds: string[],
  deps: GroupsDeps = {}
): Promise<{ housePreferences: GroupHouseChoice[] }> => {
  const database = deps.db ?? defaultDb;
  const { student, group } = await getCurrentGroup(studentId, deps);
  if (group.leaderId !== student.id) throw new AppError("NOT_LEADER");
  const round = resolveWritableRound(group);
  // Count (1..5) and uniqueness are enforced by the route body schema
  // (Groups.HousePreferencesBody); only the DB-existence check lives here.
  const existingHouses = await database.select().from(houses).where(inArray(houses.id, houseIds));
  if (existingHouses.length !== houseIds.length) throw new AppError("BAD_REQUEST");
  if (round === 2 && existingHouses.some((house) => !ROUND2_HOUSE_CODES.includes(house.code))) {
    throw new AppError("BAD_REQUEST");
  }

  return database.transaction(async (tx) => {
    await tx
      .delete(groupHouseChoices)
      .where(and(eq(groupHouseChoices.groupId, group.id), eq(groupHouseChoices.round, round)));

    const housePreferences = await tx
      .insert(groupHouseChoices)
      .values(
        houseIds.map((houseId, index) => ({ groupId: group.id, houseId, rank: index + 1, round }))
      )
      .returning();

    return { housePreferences };
  });
};

/**
 * Regenerate the caller's group's join code. Leader-only.
 * @param studentId CUNET id (from authMiddleware)
 * @returns the new join code
 * @throws {AppError} NOT_FOUND if the student or their group can't be resolved,
 *   NOT_LEADER if not the group's leader, ALREADY_CONFIRMED if the group is already confirmed,
 *   HOUSE_PICK_CLOSED if no round's pick window is currently open for it
 */
const regenerateJoinCode = async (studentId: string, deps: GroupsDeps = {}): Promise<string> => {
  const database = deps.db ?? defaultDb;
  const { student, group } = await getCurrentGroup(studentId, deps);
  if (group.leaderId !== student.id) throw new AppError("NOT_LEADER");
  assertGroupOpen(group);

  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = generateJoinCode();
    const [existing] = await database
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.joinCode, joinCode));
    if (!existing) {
      await database.update(groups).set({ joinCode }).where(eq(groups.id, group.id));
      return joinCode;
    }
  }
  throw new AppError("INTERNAL_SERVER_ERROR");
};

/**
 * Leave the current group into a fresh solo group. If the caller is the
 * leader of a group with other members, the group dissolves and every other
 * member also gets their own fresh solo group.
 * @param studentId CUNET id of the student leaving (from authMiddleware)
 * @returns the caller's new solo group
 * @throws {AppError} NOT_FOUND if the student or their group can't be resolved,
 *   ALREADY_CONFIRMED if the group is already confirmed, HOUSE_PICK_CLOSED if the
 *   house-pick deadline has passed
 */
const leave = async (studentId: string, deps: GroupsDeps = {}): Promise<GroupWithMembers> => {
  const database = deps.db ?? defaultDb;
  const { student, registration, group: oldGroup } = await getCurrentGroup(studentId, deps);
  assertGroupOpen(oldGroup);

  const isLeader = oldGroup.leaderId === student.id;
  const oldMembers = await getGroupMembers(oldGroup, deps);

  const newGroup = await database.transaction(async (tx) => {
    const createSoloGroup = async (leaderId: string) => {
      for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
        const [group] = await tx
          .insert(groups)
          .values({ leaderId, joinCode: generateJoinCode() })
          .onConflictDoNothing({ target: groups.joinCode })
          .returning();
        if (group) return group;
      }
      throw new AppError("INTERNAL_SERVER_ERROR");
    };

    const newGroup = await createSoloGroup(student.id);
    await tx
      .update(registrations)
      .set({ groupId: newGroup.id })
      .where(eq(registrations.id, registration.id));

    if (isLeader) {
      // group dissolves: every other member also gets their own fresh solo group.
      for (const member of oldMembers) {
        if (member.userId === student.id) continue;
        const memberGroup = await createSoloGroup(member.userId);
        await tx
          .update(registrations)
          .set({ groupId: memberGroup.id })
          .where(
            and(eq(registrations.studentId, member.userId), eq(registrations.project, "rpkm"))
          );
      }
      await tx.delete(groups).where(eq(groups.id, oldGroup.id));
    }
    // else: a non-leader member just leaves — the old group keeps its remaining members.

    return newGroup;
  });

  // read-only, doesn't need to be inside the transaction.
  return getGroupWithMembers(newGroup, deps);
};

/**
 * Kick a member out of the caller's group into their own fresh solo group. Leader-only.
 * @param studentId CUNET id of the leader (from authMiddleware)
 * @param targetUserId `students.id` (uuid) of the member to kick
 * @throws {AppError} NOT_FOUND if the student, group, or target member can't be
 *   resolved; NOT_LEADER if the caller isn't the group's leader; ALREADY_CONFIRMED if the
 *   group is already confirmed; HOUSE_PICK_CLOSED if the house-pick deadline has passed;
 *   BAD_REQUEST if the caller targets themselves (use leave instead)
 */
const kickMember = async (
  studentId: string,
  targetUserId: string,
  deps: GroupsDeps = {}
): Promise<GroupWithMembers> => {
  const database = deps.db ?? defaultDb;
  const { student, group } = await getCurrentGroup(studentId, deps);
  if (group.leaderId !== student.id) throw new AppError("NOT_LEADER");
  assertGroupOpen(group);
  if (targetUserId === student.id) throw new AppError("BAD_REQUEST");

  const [targetRegistration] = await database
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.studentId, targetUserId),
        eq(registrations.project, "rpkm"),
        eq(registrations.groupId, group.id)
      )
    );
  if (!targetRegistration) throw new AppError("NOT_FOUND");

  await database.transaction(async (tx) => {
    let newGroup;
    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
      const [created] = await tx
        .insert(groups)
        .values({ leaderId: targetUserId, joinCode: generateJoinCode() })
        .onConflictDoNothing({ target: groups.joinCode })
        .returning();
      if (created) {
        newGroup = created;
        break;
      }
    }
    if (!newGroup) throw new AppError("INTERNAL_SERVER_ERROR");
    await tx
      .update(registrations)
      .set({ groupId: newGroup.id })
      .where(eq(registrations.id, targetRegistration.id));
  });

  return getGroupWithMembers(group, deps);
};

// Namespace object — routes call `GroupsService.<fn>(...)` instead of
// importing individual functions. Order matches the routes in
// src/routes/rpkm/groups.ts.
export const GroupsService = {
  join,
  getMyGroup,
  getHousePreferences,
  setHousePreferences,
  regenerateJoinCode,
  leave,
  kickMember,
  isFreshman,
  resolveCurrentStudent,
  getCurrentGroup
};
