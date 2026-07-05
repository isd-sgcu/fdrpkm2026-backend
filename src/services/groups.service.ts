import { and, eq } from "drizzle-orm";

import { db } from "@src/db";
import { groups, registrations, students, type Group, type Student } from "@src/db/schema";
import type { AppErrorCode } from "@src/utils";

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
 * A random unused 6-digit join code (see groups.model.ts's joinCode pattern).
 * @throws {GroupsServiceError} INTERNAL_SERVER_ERROR if no unused code is found after 10 tries
 */
const generateJoinCode = async (): Promise<string> => {
  for (let i = 0; i < 10; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const [existing] = await db.select().from(groups).where(eq(groups.joinCode, code));
    if (!existing) return code;
  }
  throw new GroupsServiceError("INTERNAL_SERVER_ERROR");
};

/**
 * Move the caller from their current group into the group identified by `joinCode`.
 * @param studentId CUNET id of the student joining (from authMiddleware)
 * @param joinCode 6-digit code identifying the target group
 * @throws {GroupsServiceError} NOT_FRESHMEN, INVALID_JOIN_CODE, LEADER_HAS_MEMBERS, or GROUP_FULL
 */
const join = async (studentId: string, joinCode: string): Promise<GroupWithMembers> => {
  if (!isFreshman(studentId)) throw new GroupsServiceError("NOT_FRESHMEN");
  const student = await resolveCurrentStudent(studentId);

  const [targetGroup] = await db.select().from(groups).where(eq(groups.joinCode, joinCode));
  if (!targetGroup) throw new GroupsServiceError("INVALID_JOIN_CODE");

  const registration = await getCurrentRegistration(student.id);
  const oldGroupId = registration.groupId;

  if (oldGroupId) {
    const [oldGroup] = await db.select().from(groups).where(eq(groups.id, oldGroupId));
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
 * Leave the current group into a fresh solo group. If the caller is the
 * leader of a group with other members, the group dissolves and every other
 * member also gets their own fresh solo group.
 * @param studentId CUNET id of the student leaving (from authMiddleware)
 * @returns the caller's new solo group
 * @throws {GroupsServiceError} NOT_FOUND if the student or their group can't be resolved
 */
const leave = async (studentId: string): Promise<GroupWithMembers> => {
  const { student, registration, group: oldGroup } = await getCurrentGroup(studentId);

  const isLeader = oldGroup.leaderId === student.id;
  const oldMembers = await getGroupMembers(oldGroup);

  return db.transaction(async (tx) => {
    const createSoloGroup = async (leaderId: string) => {
      const joinCode = await generateJoinCode();
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

    return getGroupWithMembers(newGroup);
  });
};

/**
 * Regenerate the caller's group's join code. Leader-only.
 * @param studentId CUNET id (from authMiddleware)
 * @returns the new join code
 * @throws {GroupsServiceError} NOT_FOUND if the student or their group can't be resolved, NOT_LEADER if not the group's leader
 */
const regenerateJoinCode = async (studentId: string): Promise<string> => {
  const { student, group } = await getCurrentGroup(studentId);
  if (group.leaderId !== student.id) throw new GroupsServiceError("NOT_LEADER");

  const joinCode = await generateJoinCode();
  await db.update(groups).set({ joinCode }).where(eq(groups.id, group.id));
  return joinCode;
};

export const GroupsService = {
  GroupsServiceError,
  isFreshman,
  resolveCurrentStudent,
  getMyGroup,
  join,
  leave,
  regenerateJoinCode
};
