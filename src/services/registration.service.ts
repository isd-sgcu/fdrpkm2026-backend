import { randomInt } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { AppErrorCode } from "@src/utils";
import { db as defaultDb, type Database } from "@src/db";
import {
  groups,
  registrations,
  students,
  travelLegs,
  type Group,
  type NewTravelLeg
} from "@src/db/schema";

/**
 * Project-agnostic registration core, shared by FirstDate and RPKM (their
 * flows are identical except for the `project` tag and whether a solo group is
 * created — RPKM has groups, FD does not). Both `src/services/rpkm-registration`
 * and `src/services/fd-registration` are thin wrappers over this so the upsert
 * / resubmit-preservation / travel-leg rules can't drift between the two.
 *
 * Login/identity is Better Auth's job — this takes the authenticated user and
 * resolves it to a `students` row (no FK links Better Auth's `user` table to
 * `students`, so we link on email and upsert here, per schema-spec step 1).
 */

export type Project = "firstdate" | "rpkm";

/** Minimal slice of the Better Auth user this service needs. */
export type AuthUser = { id: string; email: string; name: string };

export type Vehicle = NewTravelLeg["vehicle"];

export type TravelLegInput = {
  vehicle: Vehicle;
  vehicleOther?: string | null;
  // origin/destination are frontend-owned free text (schema-spec: not
  // validated in the backend); the last leg's destination is server-fixed.
  originDistrict?: string;
  originProvince?: string;
  destinationDistrict?: string;
  destinationProvince?: string;
};

export type RegistrationInput = {
  pdpaConsent: boolean;
  pnoSgcuAwareness?: string | null;
  pnoReferralSource?: string | null;
  travelLegs?: TravelLegInput[];
};

export type GroupView = {
  id: string;
  leaderId: string;
  joinCode: string;
  assignedHouseId: string | null;
};

export type RegisterResult = {
  userId: string;
  registrationId: string;
  group: GroupView | null;
};

export type MeResult = {
  user: {
    // students uuid once registered; null before the students row exists
    // (never the Better Auth user id — that would switch namespaces).
    id: string | null;
    studentCode: string;
    firstName: string;
    lastName: string;
    year: string | null;
  };
  registration: {
    pdpaConsent: boolean;
    pnoSgcuAwareness: string | null;
    pnoReferralSource: string | null;
  } | null;
  travelLegs: Array<{
    seq: number;
    vehicle: Vehicle;
    vehicleOther: string | null;
    originDistrict: string;
    originProvince: string;
    destinationDistrict: string;
    destinationProvince: string;
  }>;
  group: GroupView | null;
};

/** Injectable dependencies — routes use the defaults; tests pass a migrated
 * PGlite db and a deterministic code generator. */
export type RegisterDeps = { db?: Database; genCode?: () => string };

// DB caps legs at 2 (CHECK seq in (1,2)); the last leg always lands here.
const MAX_TRAVEL_LEGS = 2;
const FIXED_LAST_DESTINATION = { district: "Pathum Wan", province: "Bangkok" } as const;
const JOIN_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const JOIN_CODE_LENGTH = 6;
const MAX_JOIN_CODE_ATTEMPTS = 10;

/** Thrown on expected business failures; the controller maps `code` to an
 * HTTP status and surfaces `message` to the caller. */
export class RegistrationServiceError extends Error {
  constructor(
    public code: AppErrorCode,
    message?: string
  ) {
    super(message ?? code);
  }
}

/** Chula email local-part is the CUNET student id (the QR payload + SSO key).
 * Lowercased so it's stable across email casings and matches the
 * case-insensitive `students.email` unique index. */
const deriveStudentId = (email: string): string => (email.split("@")[0] || email).toLowerCase();

const splitName = (name: string): { firstName: string; lastName: string } => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
};

const toGroupView = (group: Group): GroupView => ({
  id: group.id,
  leaderId: group.leaderId,
  joinCode: group.joinCode,
  assignedHouseId: group.assignedHouseId
});

/** 6 chars, A-Z + 0-9. It's a group-join credential, so use a CSPRNG
 * (`crypto.randomInt`), not `Math.random()`. Uniqueness is enforced against
 * the `groups.join_code` unique index. */
export const generateJoinCode = (): string => {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
};

/**
 * Submit a registration for `options.project`. Runs the whole write path in
 * one transaction (upsert student → upsert registration → replace travel legs
 * → optionally ensure a solo group), so a failure anywhere rolls it all back.
 *
 * Resubmit = update: a field is written only when the client sent it (omitted
 * = preserved, explicit null/`[]` = cleared). RPKM (`createSoloGroup: true`)
 * reuses or creates the solo group; FirstDate (`false`) leaves `group_id` null.
 */
export const submitRegistration = async (
  authUser: AuthUser,
  input: RegistrationInput,
  options: { project: Project; createSoloGroup: boolean },
  deps: RegisterDeps = {}
): Promise<RegisterResult> => {
  const database = deps.db ?? defaultDb;
  const genCode = deps.genCode ?? generateJoinCode;

  if (input.pdpaConsent !== true) {
    throw new RegistrationServiceError("BAD_REQUEST", "pdpaConsent must be true");
  }

  const legInputs = input.travelLegs ?? [];
  if (legInputs.length > MAX_TRAVEL_LEGS) {
    throw new RegistrationServiceError(
      "BAD_REQUEST",
      `at most ${MAX_TRAVEL_LEGS} travel legs are allowed`
    );
  }
  for (const leg of legInputs) {
    if (leg.vehicle === "other" && !leg.vehicleOther?.trim()) {
      throw new RegistrationServiceError(
        "BAD_REQUEST",
        "vehicleOther is required when vehicle is 'other'"
      );
    }
  }

  const derivedStudentId = deriveStudentId(authUser.email);
  const email = authUser.email.toLowerCase();
  const { firstName, lastName } = splitName(authUser.name);

  // A field is written only when the client actually sent it: an omitted
  // (undefined) field must NOT clobber a previously stored value on resubmit.
  // An explicit null still clears it.
  const awarenessProvided = input.pnoSgcuAwareness !== undefined;
  const awareness = input.pnoSgcuAwareness ?? null;
  const referralProvided = input.pnoReferralSource !== undefined;
  const referral = input.pnoReferralSource ?? null;

  return database.transaction(async (tx) => {
    // 1. upsert the student (identity link on the immutable student_id).
    const [student] = await tx
      .insert(students)
      .values({
        studentId: derivedStudentId,
        email,
        firstName,
        lastName,
        pnoSgcuAwareness: awarenessProvided ? awareness : null
      })
      .onConflictDoUpdate({
        target: students.studentId,
        set: awarenessProvided ? { pnoSgcuAwareness: awareness } : { updatedAt: new Date() }
      })
      .returning();

    // 2. upsert this student's registration for the project (1 per pair).
    const [registration] = await tx
      .insert(registrations)
      .values({
        studentId: student.id,
        project: options.project,
        pdpaAcceptedAt: new Date(),
        pnoReferralSource: referralProvided ? referral : null
      })
      .onConflictDoUpdate({
        target: [registrations.studentId, registrations.project],
        set: {
          pdpaAcceptedAt: new Date(),
          ...(referralProvided ? { pnoReferralSource: referral } : {})
        }
      })
      .returning();

    // 3. replace the travel legs — but only when the client sent the field.
    //    Omitted leaves existing legs untouched; an explicit `[]` clears them.
    if (input.travelLegs !== undefined) {
      await tx.delete(travelLegs).where(eq(travelLegs.registrationId, registration.id));
      if (legInputs.length > 0) {
        const rows: NewTravelLeg[] = legInputs.map((leg, index) => {
          const isLast = index === legInputs.length - 1;
          return {
            registrationId: registration.id,
            seq: index + 1,
            vehicle: leg.vehicle,
            vehicleOther: leg.vehicle === "other" ? leg.vehicleOther!.trim() : null,
            originDistrict: leg.originDistrict ?? "",
            originProvince: leg.originProvince ?? "",
            destinationDistrict: isLast
              ? FIXED_LAST_DESTINATION.district
              : (leg.destinationDistrict ?? ""),
            destinationProvince: isLast
              ? FIXED_LAST_DESTINATION.province
              : (leg.destinationProvince ?? "")
          };
        });
        await tx.insert(travelLegs).values(rows);
      }
    }

    // 4. RPKM only: ensure a solo group (reuse the one this registration
    //    already points at, otherwise create it and link it back). FirstDate
    //    has no groups — group_id stays null.
    let group: GroupView | null = null;
    if (options.createSoloGroup) {
      if (registration.groupId) {
        const [existing] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, registration.groupId))
          .limit(1);
        if (existing) group = toGroupView(existing);
      }

      if (!group) {
        let created: Group | undefined;
        for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
          // Atomic insert: a colliding join_code hits the unique index and
          // onConflictDoNothing returns no row (no TOCTOU, no aborted tx), so
          // we just retry with a fresh code.
          [created] = await tx
            .insert(groups)
            .values({ leaderId: student.id, joinCode: genCode(), assignedHouseId: null })
            .onConflictDoNothing({ target: groups.joinCode })
            .returning();
          if (created) break;
        }
        if (!created) {
          throw new RegistrationServiceError(
            "INTERNAL_SERVER_ERROR",
            "could not generate a unique join code"
          );
        }
        await tx
          .update(registrations)
          .set({ groupId: created.id })
          .where(eq(registrations.id, registration.id));
        group = toGroupView(created);
      }
    }

    return { userId: student.id, registrationId: registration.id, group };
  });
};

/**
 * Current user's data for prefilling a project's form. Never-registered users
 * get their profile (from the auth user, with `id: null`) and null
 * registration/group + empty legs — a stable shape the frontend needn't
 * branch on. `group` is only populated when the registration points at one
 * (always null for FirstDate).
 */
export const getRegistrationMe = async (
  authUser: AuthUser,
  project: Project,
  deps: { db?: Database } = {}
): Promise<MeResult> => {
  const database = deps.db ?? defaultDb;
  const studentId = deriveStudentId(authUser.email);

  const [student] = await database
    .select()
    .from(students)
    .where(eq(students.studentId, studentId))
    .limit(1);

  if (!student) {
    const { firstName, lastName } = splitName(authUser.name);
    return {
      user: { id: null, studentCode: studentId, firstName, lastName, year: null },
      registration: null,
      travelLegs: [],
      group: null
    };
  }

  const [registration] = await database
    .select()
    .from(registrations)
    .where(and(eq(registrations.studentId, student.id), eq(registrations.project, project)))
    .limit(1);

  let legs: MeResult["travelLegs"] = [];
  let group: GroupView | null = null;

  if (registration) {
    // Legs and group are independent (both keyed off `registration`) — fetch
    // concurrently instead of serially.
    const [legRows, groupRows] = await Promise.all([
      database
        .select()
        .from(travelLegs)
        .where(eq(travelLegs.registrationId, registration.id))
        .orderBy(travelLegs.seq),
      registration.groupId
        ? database.select().from(groups).where(eq(groups.id, registration.groupId)).limit(1)
        : Promise.resolve([])
    ]);
    legs = legRows.map((leg) => ({
      seq: leg.seq,
      vehicle: leg.vehicle,
      vehicleOther: leg.vehicleOther,
      originDistrict: leg.originDistrict,
      originProvince: leg.originProvince,
      destinationDistrict: leg.destinationDistrict,
      destinationProvince: leg.destinationProvince
    }));
    if (groupRows[0]) group = toGroupView(groupRows[0]);
  }

  return {
    user: {
      id: student.id,
      studentCode: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      year: student.year
    },
    // A registration only exists once PDPA was accepted (pdpa_accepted_at is
    // NOT NULL), so consent is always true here.
    registration: registration
      ? {
          pdpaConsent: true,
          pnoSgcuAwareness: student.pnoSgcuAwareness,
          pnoReferralSource: registration.pnoReferralSource
        }
      : null,
    travelLegs: legs,
    group
  };
};
