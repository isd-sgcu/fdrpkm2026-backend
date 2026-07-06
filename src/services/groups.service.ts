import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@src/db";
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
import type { AppErrorCode } from "@src/utils";
import { isEventPassed } from "@src/utils/flags";

type GroupMember = {
  userId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  isLeader: boolean;
};

type GroupWithMembers = Group & { members: GroupMember[] };

class GroupsServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

// --- Helpers (private) ---

/**
 * Whether a CUNET id belongs to a year-one (freshman) student.
 * @param studentId CUNET id, e.g. "6712345678" — year is never stored, only derived from this prefix.
 * @returns true if `studentId` starts with "69"
 */
const isFreshman = (studentId: string): boolean => studentId.startsWith("69");

/**
 * Resolves the `students` row for a CUNET id.
 * @param studentId CUNET id, as derived by authMiddleware from the session email
 * @throws {GroupsServiceError} NOT_FOUND if no `students` row matches
 */
const resolveCurrentStudent = async (studentId: string): Promise<Student> => {
  const [student] = await db.select().from(students).where(eq(students.studentId, studentId));
  if (!student) throw new GroupsServiceError("NOT_FOUND");
  return student;
};

/**
 * All members of a group, with `isLeader` set for the one matching `group.leaderId`.
 * @param group the group to list members for
 */
const getGroupMembers = async (group: Group): Promise<GroupMember[]> => {
  const rows = await db
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
const getGroupWithMembers = async (group: Group): Promise<GroupWithMembers> => ({
  ...group,
  members: await getGroupMembers(group)
});

/**
 * The student's rpkm registration — always exactly one once they've registered.
 * @param studentId `students.id` (uuid), not the CUNET id
 * @throws {GroupsServiceError} NOT_FOUND if the student has no rpkm registration yet
 */
const getCurrentRegistration = async (studentId: string) => {
  const [registration] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.studentId, studentId), eq(registrations.project, "rpkm")));
  if (!registration) throw new GroupsServiceError("NOT_FOUND");
  return registration;
};

/**
 * Resolves student -> their rpkm registration -> the group it points to.
 * Shared by every endpoint that acts on "the caller's current group".
 * @param studentId CUNET id (from authMiddleware)
 * @throws {GroupsServiceError} NOT_FOUND if the student, their registration, or their group can't be resolved
 */
const getCurrentGroup = async (studentId: string) => {
  const student = await resolveCurrentStudent(studentId);
  const registration = await getCurrentRegistration(student.id);
  if (!registration.groupId) throw new GroupsServiceError("NOT_FOUND");

  const [group] = await db.select().from(groups).where(eq(groups.id, registration.groupId));
  if (!group) throw new GroupsServiceError("NOT_FOUND");

  return { student, registration, group };
};

const JOIN_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const JOIN_CODE_LENGTH = 6;

// `db` itself, or the `tx` a transaction callback receives — accepting either
// lets generateJoinCode be called from inside db.transaction(...) without
// opening a second connection (which can deadlock the pool).
type DbClient = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * A random unused 6-character join code, uppercase letters + digits (see groups.model.ts's joinCode pattern).
 * @param client `db` or an in-progress transaction's `tx` — pass `tx` when calling from
 *   inside `db.transaction(...)` so this doesn't open a second connection and deadlock the pool.
 * @throws {GroupsServiceError} INTERNAL_SERVER_ERROR if no unused code is found after 10 tries
 */
const generateJoinCode = async (client: DbClient = db): Promise<string> => {
  for (let i = 0; i < 10; i++) {
    let code = "";
    for (let j = 0; j < JOIN_CODE_LENGTH; j++)
      code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];

    const [existing] = await client.select().from(groups).where(eq(groups.joinCode, code));
    if (!existing) return code;
  }
  throw new GroupsServiceError("INTERNAL_SERVER_ERROR");
};

// --- Public API (same order as the routes in src/routes/rpkm/groups.ts) ---

/**
 * Move the caller from their current group into the group identified by `joinCode`.
 * @param studentId CUNET id of the student joining (from authMiddleware)
 * @param joinCode 6-digit code identifying the target group
 * @throws {GroupsServiceError} NOT_FRESHMEN, INVALID_JOIN_CODE, LEADER_HAS_MEMBERS, GROUP_FULL, or ALREADY_CONFIRMED
 */
const join = async (studentId: string, joinCode: string): Promise<GroupWithMembers> => {
  if (!isFreshman(studentId)) throw new GroupsServiceError("NOT_FRESHMEN");
  const student = await resolveCurrentStudent(studentId);

  const [targetGroup] = await db.select().from(groups).where(eq(groups.joinCode, joinCode));
  if (!targetGroup) throw new GroupsServiceError("INVALID_JOIN_CODE");
  if (targetGroup.confirmedAt) throw new GroupsServiceError("ALREADY_CONFIRMED");

  const registration = await getCurrentRegistration(student.id);
  const oldGroupId = registration.groupId;

  // already in this group — no-op success, skip leader/capacity checks and the write entirely.
  if (oldGroupId === targetGroup.id) return getGroupWithMembers(targetGroup);

  if (oldGroupId) {
    const [oldGroup] = await db.select().from(groups).where(eq(groups.id, oldGroupId));
    if (oldGroup?.confirmedAt) throw new GroupsServiceError("ALREADY_CONFIRMED");
    if (oldGroup && oldGroup.leaderId === student.id) {
      const oldMembers = await getGroupMembers(oldGroup);
      // a solo leader (no one else yet) may still hop groups; only blocked once someone's joined them.
      if (oldMembers.length > 1) throw new GroupsServiceError("LEADER_HAS_MEMBERS");
    }
  }

  const targetMembers = await getGroupMembers(targetGroup);
  if (targetMembers.length >= 4) throw new GroupsServiceError("GROUP_FULL");

  await db.transaction(async (tx) => {
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

  return getGroupWithMembers(targetGroup);
};

/**
 * Current group + members for the logged-in student.
 * @param studentId CUNET id (from authMiddleware)
 * @throws {GroupsServiceError} NOT_FOUND if the student or their group can't be resolved
 */
const getMyGroup = async (studentId: string): Promise<GroupWithMembers> => {
  const { group } = await getCurrentGroup(studentId);
  return getGroupWithMembers(group);
};

/**
 * The caller's group's ranked house choices, most preferred (rank 1) first.
 * @param studentId CUNET id (from authMiddleware)
 * @throws {GroupsServiceError} NOT_FOUND if the student or their group can't be resolved
 */
const getHousePreferences = async (
  studentId: string
): Promise<{ housePreferences: GroupHouseChoice[] }> => {
  const { group } = await getCurrentGroup(studentId);
  const housePreferences = await db
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
 * @throws {GroupsServiceError} NOT_FOUND if the student/group/a houseId can't be resolved,
 *   NOT_LEADER if not the group's leader, HOUSE_PICK_CLOSED if the group already confirmed
 *   or the house-pick deadline has passed, BAD_REQUEST if houseIds has duplicates
 */
const setHousePreferences = async (
  studentId: string,
  houseIds: string[]
): Promise<{ housePreferences: GroupHouseChoice[] }> => {
  const { student, group } = await getCurrentGroup(studentId);
  if (group.leaderId !== student.id) throw new GroupsServiceError("NOT_LEADER");
  if (group.confirmedAt || isEventPassed("rpkm_house_pick"))
    throw new GroupsServiceError("HOUSE_PICK_CLOSED");
  if (new Set(houseIds).size !== houseIds.length) throw new GroupsServiceError("BAD_REQUEST");

  const existingHouses = await db.select().from(houses).where(inArray(houses.id, houseIds));
  if (existingHouses.length !== houseIds.length) throw new GroupsServiceError("BAD_REQUEST");

  return db.transaction(async (tx) => {
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
 * @throws {GroupsServiceError} NOT_FOUND if the student or their group can't be resolved,
 *   NOT_LEADER if not the group's leader, ALREADY_CONFIRMED if the group is already confirmed
 */
const regenerateJoinCode = async (studentId: string): Promise<string> => {
  const { student, group } = await getCurrentGroup(studentId);
  if (group.leaderId !== student.id) throw new GroupsServiceError("NOT_LEADER");
  if (group.confirmedAt) throw new GroupsServiceError("ALREADY_CONFIRMED");

  const joinCode = await generateJoinCode();
  await db.update(groups).set({ joinCode }).where(eq(groups.id, group.id));
  return joinCode;
};

/**
 * Leave the current group into a fresh solo group. If the caller is the
 * leader of a group with other members, the group dissolves and every other
 * member also gets their own fresh solo group.
 * @param studentId CUNET id of the student leaving (from authMiddleware)
 * @returns the caller's new solo group
 * @throws {GroupsServiceError} NOT_FOUND if the student or their group can't be resolved,
 *   ALREADY_CONFIRMED if the group is already confirmed
 */
const leave = async (studentId: string): Promise<GroupWithMembers> => {
  const { student, registration, group: oldGroup } = await getCurrentGroup(studentId);
  if (oldGroup.confirmedAt) throw new GroupsServiceError("ALREADY_CONFIRMED");

  const isLeader = oldGroup.leaderId === student.id;
  const oldMembers = await getGroupMembers(oldGroup);

  const newGroup = await db.transaction(async (tx) => {
    const createSoloGroup = async (leaderId: string) => {
      const joinCode = await generateJoinCode(tx);
      const [group] = await tx.insert(groups).values({ leaderId, joinCode }).returning();
      return group;
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
  return getGroupWithMembers(newGroup);
};

/**
 * Kick a member out of the caller's group into their own fresh solo group. Leader-only.
 * @param studentId CUNET id of the leader (from authMiddleware)
 * @param targetUserId `students.id` (uuid) of the member to kick
 * @throws {GroupsServiceError} NOT_FOUND if the student, group, or target member can't be
 *   resolved; NOT_LEADER if the caller isn't the group's leader; ALREADY_CONFIRMED if the
 *   group is already confirmed; BAD_REQUEST if the caller targets themselves (use leave instead)
 */
const kickMember = async (studentId: string, targetUserId: string): Promise<GroupWithMembers> => {
  const { student, group } = await getCurrentGroup(studentId);
  if (group.leaderId !== student.id) throw new GroupsServiceError("NOT_LEADER");
  if (group.confirmedAt) throw new GroupsServiceError("ALREADY_CONFIRMED");
  if (targetUserId === student.id) throw new GroupsServiceError("BAD_REQUEST");

  const [targetRegistration] = await db
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.studentId, targetUserId),
        eq(registrations.project, "rpkm"),
        eq(registrations.groupId, group.id)
      )
    );
  if (!targetRegistration) throw new GroupsServiceError("NOT_FOUND");

  await db.transaction(async (tx) => {
    const joinCode = await generateJoinCode(tx);
    const [newGroup] = await tx
      .insert(groups)
      .values({ leaderId: targetUserId, joinCode })
      .returning();
    await tx
      .update(registrations)
      .set({ groupId: newGroup.id })
      .where(eq(registrations.id, targetRegistration.id));
  });

  return getGroupWithMembers(group);
};

/**
 * Confirm the caller's group (POST /rpkm/houses/confirm). Leader-only.
 * House preferences are optional (0-5 allowed); confirmation only fails
 * if somehow more than 5 are set. Locks house-preferences and membership
 * changes for the group afterward.
 * @param studentId CUNET id (from authMiddleware)
 * @throws {GroupsServiceError} NOT_FRESHMEN, NOT_FOUND if the student or their group can't
 *   be resolved, NOT_LEADER, ALREADY_CONFIRMED, or TOO_MANY_HOUSE_PREFS
 */
const confirmGroup = async (studentId: string): Promise<{ confirmedAt: Date }> => {
  if (!isFreshman(studentId)) throw new GroupsServiceError("NOT_FRESHMEN");
  const { student, group } = await getCurrentGroup(studentId);
  if (group.leaderId !== student.id) throw new GroupsServiceError("NOT_LEADER");
  if (group.confirmedAt) throw new GroupsServiceError("ALREADY_CONFIRMED");

  const preferences = await db
    .select()
    .from(groupHouseChoices)
    .where(eq(groupHouseChoices.groupId, group.id));
  if (preferences.length > 5) throw new GroupsServiceError("TOO_MANY_HOUSE_PREFS");

  const confirmedAt = new Date();
  await db.update(groups).set({ confirmedAt }).where(eq(groups.id, group.id));
  return { confirmedAt };
};

// Namespace object — routes call `GroupsService.<fn>(...)` instead of
// importing individual functions. Order matches the routes in
// src/routes/rpkm/groups.ts, plus confirmGroup for POST /rpkm/houses/confirm.
export const GroupsService = {
  GroupsServiceError,
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
