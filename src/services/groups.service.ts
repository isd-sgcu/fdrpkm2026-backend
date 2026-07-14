import { and, asc, eq, inArray } from "drizzle-orm";

import { db as defaultDb, type Database } from "@src/db";
import { generateJoinCode, MAX_JOIN_CODE_ATTEMPTS } from "@src/utils";
import {
  groupHouseChoices,
  groups,
  houses,
  registrations,
  students,
  type Group,
  type GroupHouseChoice,
  type Student
} from "@src/db/schema";
import { AppError, isFreshman } from "@src/utils";
import { isEventPassed } from "@src/utils/flags";

export type GroupsDeps = { db?: Database };

type GroupMember = {
  userId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  isLeader: boolean;
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
      nickname: students.nickname
    })
    .from(registrations)
    .innerJoin(students, eq(registrations.studentId, students.id))
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

// --- Public API (same order as the routes in src/routes/rpkm/groups.ts) ---

/**
 * Move the caller from their current group into the group identified by `joinCode`.
 * @param studentId CUNET id of the student joining (from authMiddleware)
 * @param joinCode 6-digit code identifying the target group
 * @throws {AppError} NOT_FRESHMEN, INVALID_JOIN_CODE, LEADER_HAS_MEMBERS, GROUP_FULL, or ALREADY_CONFIRMED
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
  if (targetGroup.confirmedAt) throw new AppError("ALREADY_CONFIRMED");

  const registration = await getCurrentRegistration(student.id, deps);
  const oldGroupId = registration.groupId;

  // already in this group — no-op success, skip leader/capacity checks and the write entirely.
  if (oldGroupId === targetGroup.id) return getGroupWithMembers(targetGroup, deps);

  if (oldGroupId) {
    const [oldGroup] = await database.select().from(groups).where(eq(groups.id, oldGroupId));
    if (oldGroup?.confirmedAt) throw new AppError("ALREADY_CONFIRMED");
    if (oldGroup && oldGroup.leaderId === student.id) {
      const oldMembers = await getGroupMembers(oldGroup, deps);
      // a solo leader (no one else yet) may still hop groups; only blocked once someone's joined them.
      if (oldMembers.length > 1) throw new AppError("LEADER_HAS_MEMBERS");
    }
  }

  const targetMembers = await getGroupMembers(targetGroup, deps);
  if (targetMembers.length >= 4) throw new AppError("GROUP_FULL");

  await database.transaction(async (tx) => {
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
  const housePreferences = await database
    .select()
    .from(groupHouseChoices)
    .where(eq(groupHouseChoices.groupId, group.id))
    .orderBy(asc(groupHouseChoices.rank));

  return { housePreferences };
};

/**
 * Replace the caller's group's whole ranked house-choice set. Leader-only.
 * @param studentId CUNET id (from authMiddleware)
 * @param houseIds ranked house ids, most preferred first (rank = index + 1)
 * @throws {AppError} NOT_FOUND if the student/group can't be resolved,
 *   NOT_LEADER if not the group's leader, HOUSE_PICK_CLOSED if the group already confirmed
 *   or the house-pick deadline has passed, BAD_REQUEST if a houseId doesn't exist
 */
const setHousePreferences = async (
  studentId: string,
  houseIds: string[],
  deps: GroupsDeps = {}
): Promise<{ housePreferences: GroupHouseChoice[] }> => {
  const database = deps.db ?? defaultDb;
  const { student, group } = await getCurrentGroup(studentId, deps);
  if (group.leaderId !== student.id) throw new AppError("NOT_LEADER");
  if (group.confirmedAt || isEventPassed("rpkm_house_pick"))
    throw new AppError("HOUSE_PICK_CLOSED");
  // Count (1..5) and uniqueness are enforced by the route body schema
  // (Groups.HousePreferencesBody); only the DB-existence check lives here.
  const existingHouses = await database.select().from(houses).where(inArray(houses.id, houseIds));
  if (existingHouses.length !== houseIds.length) throw new AppError("BAD_REQUEST");

  return database.transaction(async (tx) => {
    await tx.delete(groupHouseChoices).where(eq(groupHouseChoices.groupId, group.id));

    const housePreferences = await tx
      .insert(groupHouseChoices)
      .values(houseIds.map((houseId, index) => ({ groupId: group.id, houseId, rank: index + 1 })))
      .returning();

    return { housePreferences };
  });
};

/**
 * Regenerate the caller's group's join code. Leader-only.
 * @param studentId CUNET id (from authMiddleware)
 * @returns the new join code
 * @throws {AppError} NOT_FOUND if the student or their group can't be resolved,
 *   NOT_LEADER if not the group's leader, ALREADY_CONFIRMED if the group is already confirmed
 */
const regenerateJoinCode = async (studentId: string, deps: GroupsDeps = {}): Promise<string> => {
  const database = deps.db ?? defaultDb;
  const { student, group } = await getCurrentGroup(studentId, deps);
  if (group.leaderId !== student.id) throw new AppError("NOT_LEADER");
  if (group.confirmedAt) throw new AppError("ALREADY_CONFIRMED");

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
 *   ALREADY_CONFIRMED if the group is already confirmed
 */
const leave = async (studentId: string, deps: GroupsDeps = {}): Promise<GroupWithMembers> => {
  const database = deps.db ?? defaultDb;
  const { student, registration, group: oldGroup } = await getCurrentGroup(studentId, deps);
  if (oldGroup.confirmedAt) throw new AppError("ALREADY_CONFIRMED");

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
 *   group is already confirmed; BAD_REQUEST if the caller targets themselves (use leave instead)
 */
const kickMember = async (
  studentId: string,
  targetUserId: string,
  deps: GroupsDeps = {}
): Promise<GroupWithMembers> => {
  const database = deps.db ?? defaultDb;
  const { student, group } = await getCurrentGroup(studentId, deps);
  if (group.leaderId !== student.id) throw new AppError("NOT_LEADER");
  if (group.confirmedAt) throw new AppError("ALREADY_CONFIRMED");
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

/**
 * Confirm the caller's group (POST /rpkm/houses/confirm). Leader-only.
 * House preferences are optional (0-5 allowed); confirmation only fails
 * if somehow more than 5 are set. Locks house-preferences and membership
 * changes for the group afterward.
 * @param studentId CUNET id (from authMiddleware)
 * @throws {AppError} NOT_FRESHMEN, NOT_FOUND if the student or their group can't
 *   be resolved, NOT_LEADER, ALREADY_CONFIRMED, or TOO_MANY_HOUSE_PREFS
 */
const confirmGroup = async (
  studentId: string,
  deps: GroupsDeps = {}
): Promise<{ confirmedAt: Date }> => {
  const database = deps.db ?? defaultDb;
  if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
  const { student, group } = await getCurrentGroup(studentId, deps);
  if (group.leaderId !== student.id) throw new AppError("NOT_LEADER");
  if (group.confirmedAt) throw new AppError("ALREADY_CONFIRMED");

  const preferences = await database
    .select()
    .from(groupHouseChoices)
    .where(eq(groupHouseChoices.groupId, group.id));
  if (preferences.length < 1) throw new AppError("HOUSE_PREF_INCOMPLETE");
  if (preferences.length > 5) throw new AppError("TOO_MANY_HOUSE_PREFS");

  const confirmedAt = new Date();
  await database.update(groups).set({ confirmedAt }).where(eq(groups.id, group.id));
  return { confirmedAt };
};

// Namespace object — routes call `GroupsService.<fn>(...)` instead of
// importing individual functions. Order matches the routes in
// src/routes/rpkm/groups.ts, plus confirmGroup for POST /rpkm/houses/confirm.
export const GroupsService = {
  join,
  getMyGroup,
  getHousePreferences,
  setHousePreferences,
  regenerateJoinCode,
  leave,
  kickMember,
  confirmGroup,
  isFreshman,
  resolveCurrentStudent,
  getCurrentGroup
};
