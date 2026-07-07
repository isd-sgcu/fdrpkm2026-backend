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
  type NewStudent,
  type NewTravelLeg,
  type Student
} from "@src/db/schema";

/**
 * Project-agnostic registration core, shared by FirstDate and RPKM (their
 * flows are identical except for the `project` tag and whether a solo group is
 * created — RPKM has groups, FD does not). `src/services/rpkm-registration` and
 * `src/services/fd-registration` are thin wrappers over this so the identity /
 * validation / travel-leg rules can't drift between the two.
 *
 * Login/identity is Better Auth's job — this takes the authenticated user and
 * resolves it to a `students` row (no FK links Better Auth's `user` table to
 * `students`, so we link on the email-derived student_id and upsert here).
 *
 * `students` is upserted from the payload on the *first* registration (and on
 * a cross-project first registration), but a `registrations` row is
 * **insert-only** — one per (student, project). A duplicate submit is rejected
 * with ALREADY_REGISTERED (409), which rolls the whole transaction back — so a
 * re-submit does NOT edit an existing profile. Post-registration profile edits
 * would need a separate `PATCH /users/me` endpoint (not built).
 */

export type Project = "firstdate" | "rpkm";

/** Minimal slice of the Better Auth user this service needs. */
export type AuthUser = { id: string; email: string; name: string };

export type Vehicle = NewTravelLeg["vehicle"];
export type Prefix = Student["prefix"];

export type TravelLegInput = {
  vehicle: Vehicle;
  vehicleOther?: string | null;
  // origin/destination are frontend-owned free text (schema-spec: not
  // validated in the backend). Only the 4th leg of a 4-leg journey has its
  // destination server-fixed to Pathum Wan / Bangkok.
  originDistrict?: string;
  originProvince?: string;
  destinationDistrict?: string;
  destinationProvince?: string;
};

export type RegistrationInput = {
  pdpaConsent: boolean;
  // Profile fields — written to `students` (identity, shared across projects).
  // firstName/lastName come from the payload so users can correct them (e.g.
  // to Thai); student_id + email stay derived from the auth email (anti-spoof).
  firstName?: string;
  lastName?: string;
  prefix?: Prefix;
  nickname?: string | null;
  faculty?: string | null;
  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  allergies?: string | null;
  dietary?: string | null;
  medicalNotes?: string | null;
  pnoSgcuAwareness?: string | null;
  // Registration-specific.
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

export type MeUser = {
  // students uuid once registered; null before the students row exists
  // (never the Better Auth user id — that would switch namespaces).
  id: string | null;
  studentCode: string;
  prefix: string | null;
  firstName: string;
  lastName: string;
  nickname: string | null;
  faculty: string | null;
  year: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  allergies: string | null;
  dietary: string | null;
  medicalNotes: string | null;
  // Survey (P&O) awareness lives on `students`, so it's a user field — kept out
  // of `registration` so the frontend can prefill it even before this project's
  // registration exists.
  pnoSgcuAwareness: string | null;
};

export type MeResult = {
  user: MeUser;
  registration: {
    pdpaConsent: boolean;
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

const MIN_TRAVEL_LEGS = 1;
const MAX_TRAVEL_LEGS = 4;
// Only a full 4-leg journey has its final destination fixed (the last leg
// arrives at the event); shorter journeys keep the frontend-supplied value.
const FORCE_DESTINATION_AT_LENGTH = 4;
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

/** Collect the `students` profile columns the client actually sent, so a
 * partial payload doesn't clobber stored values on the upsert's conflict set. */
const collectProfile = (input: RegistrationInput): Partial<NewStudent> => {
  const profile: Partial<NewStudent> = {};
  if (input.firstName !== undefined) profile.firstName = input.firstName;
  if (input.lastName !== undefined) profile.lastName = input.lastName;
  if (input.prefix !== undefined) profile.prefix = input.prefix;
  if (input.nickname !== undefined) profile.nickname = input.nickname;
  if (input.faculty !== undefined) profile.faculty = input.faculty;
  if (input.phone !== undefined) profile.phone = input.phone;
  if (input.emergencyContactName !== undefined)
    profile.emergencyContactName = input.emergencyContactName;
  if (input.emergencyContactPhone !== undefined)
    profile.emergencyContactPhone = input.emergencyContactPhone;
  if (input.allergies !== undefined) profile.allergies = input.allergies;
  if (input.dietary !== undefined) profile.dietary = input.dietary;
  if (input.medicalNotes !== undefined) profile.medicalNotes = input.medicalNotes;
  if (input.pnoSgcuAwareness !== undefined) profile.pnoSgcuAwareness = input.pnoSgcuAwareness;
  return profile;
};

/**
 * Submit a registration for `options.project`, in one transaction:
 * upsert `students` (profile) → insert `registrations` (insert-only) → insert
 * travel legs → optionally create the RPKM solo group. Any failure rolls it
 * all back.
 *
 * Registration is insert-only: a second submit for the same (student, project)
 * throws ALREADY_REGISTERED (409). RPKM (`createSoloGroup: true`) also creates
 * the solo group; FirstDate (`false`) leaves `group_id` null.
 */
export const submitRegistration = async (
  authUser: AuthUser,
  input: RegistrationInput,
  options: { project: Project; createSoloGroup: boolean },
  deps: RegisterDeps = {}
): Promise<RegisterResult> => {
  const database = deps.db ?? defaultDb;
  const genCode = deps.genCode ?? generateJoinCode;

  const derivedStudentId = deriveStudentId(authUser.email);

  if (input.pdpaConsent !== true) {
    throw new RegistrationServiceError("PDPA_REQUIRED", "error_pdpa_required");
  }

  const legInputs = input.travelLegs ?? [];
  if (legInputs.length < MIN_TRAVEL_LEGS || legInputs.length > MAX_TRAVEL_LEGS) {
    throw new RegistrationServiceError(
      "BAD_REQUEST",
      `travelLegs must have between ${MIN_TRAVEL_LEGS} and ${MAX_TRAVEL_LEGS} items`
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

  const email = authUser.email.toLowerCase();
  const authName = splitName(authUser.name);
  const profile = collectProfile(input);

  return database.transaction(async (tx) => {
    // Staff are pre-seeded (students.role = 'staff') and must not register as
    // participants. Check before the upsert so a staff row is never mutated.
    // Any other authenticated user (new, or an existing 'student') may register.
    const [existing] = await tx
      .select({ role: students.role })
      .from(students)
      .where(eq(students.studentId, derivedStudentId))
      .limit(1);
    if (existing?.role === "staff") {
      throw new RegistrationServiceError("FORBIDDEN", "error_staff_forbidden");
    }

    // 1. upsert the student (identity link on the immutable student_id). Names
    //    come from the payload when given (fallback to the SSO name); the
    //    conflict set only touches columns the client actually sent.
    const [student] = await tx
      .insert(students)
      .values({
        studentId: derivedStudentId,
        email,
        firstName: input.firstName ?? authName.firstName,
        lastName: input.lastName ?? authName.lastName,
        ...profile
      })
      .onConflictDoUpdate({
        target: students.studentId,
        set: Object.keys(profile).length > 0 ? profile : { updatedAt: new Date() }
      })
      .returning();

    // 2. insert the registration (insert-only — 1 per student per project). A
    //    conflict means they've already registered: reject and roll back.
    const [registration] = await tx
      .insert(registrations)
      .values({
        studentId: student.id,
        project: options.project,
        pdpaAcceptedAt: new Date(),
        pnoReferralSource: input.pnoReferralSource ?? null
      })
      .onConflictDoNothing({ target: [registrations.studentId, registrations.project] })
      .returning();

    if (!registration) {
      throw new RegistrationServiceError("ALREADY_REGISTERED", "error_already_registered");
    }

    // 3. insert the travel legs (1..4). Only a full 4-leg journey has its final
    //    leg's destination forced to Pathum Wan / Bangkok.
    const rows: NewTravelLeg[] = legInputs.map((leg, index) => {
      const forceDestination =
        legInputs.length === FORCE_DESTINATION_AT_LENGTH && index === legInputs.length - 1;
      return {
        registrationId: registration.id,
        seq: index + 1,
        vehicle: leg.vehicle,
        vehicleOther: leg.vehicle === "other" ? leg.vehicleOther!.trim() : null,
        originDistrict: leg.originDistrict ?? "",
        originProvince: leg.originProvince ?? "",
        destinationDistrict: forceDestination
          ? FIXED_LAST_DESTINATION.district
          : (leg.destinationDistrict ?? ""),
        destinationProvince: forceDestination
          ? FIXED_LAST_DESTINATION.province
          : (leg.destinationProvince ?? "")
      };
    });
    await tx.insert(travelLegs).values(rows);

    // 4. RPKM only: create the solo group and link it back. FirstDate has no
    //    groups — group_id stays null.
    let group: GroupView | null = null;
    if (options.createSoloGroup) {
      let created: Group | undefined;
      for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
        // Atomic insert: a colliding join_code hits the unique index and
        // onConflictDoNothing returns no row (no TOCTOU, no aborted tx), so we
        // just retry with a fresh code.
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

    return { userId: student.id, registrationId: registration.id, group };
  });
};

const toMeUser = (student: Student): MeUser => ({
  id: student.id,
  studentCode: student.studentId,
  prefix: student.prefix,
  firstName: student.firstName,
  lastName: student.lastName,
  nickname: student.nickname,
  faculty: student.faculty,
  year: student.year,
  phone: student.phone,
  emergencyContactName: student.emergencyContactName,
  emergencyContactPhone: student.emergencyContactPhone,
  allergies: student.allergies,
  dietary: student.dietary,
  medicalNotes: student.medicalNotes,
  pnoSgcuAwareness: student.pnoSgcuAwareness
});

/**
 * Current user's data for prefilling a project's form. Never-registered users
 * get their profile (from the auth user, with `id: null`) and null
 * registration/group + empty legs — a stable shape the frontend needn't branch
 * on. `group` is only populated when the registration points at one (always
 * null for FirstDate).
 */
export const getRegistrationMe = async (
  authUser: AuthUser,
  project: Project,
  deps: { db?: Database } = {}
): Promise<MeResult> => {
  const database = deps.db ?? defaultDb;
  const studentId = deriveStudentId(authUser.email);

  // Any authenticated user may read their own prefill (no freshman/staff gate).
  const [student] = await database
    .select()
    .from(students)
    .where(eq(students.studentId, studentId))
    .limit(1);

  if (!student) {
    const { firstName, lastName } = splitName(authUser.name);
    return {
      user: {
        id: null,
        studentCode: studentId,
        prefix: null,
        firstName,
        lastName,
        nickname: null,
        faculty: null,
        year: null,
        phone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        allergies: null,
        dietary: null,
        medicalNotes: null,
        pnoSgcuAwareness: null
      },
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
    user: toMeUser(student),
    // A registration only exists once PDPA was accepted (pdpa_accepted_at is
    // NOT NULL), so consent is always true here.
    registration: registration
      ? { pdpaConsent: true, pnoReferralSource: registration.pnoReferralSource }
      : null,
    travelLegs: legs,
    group
  };
};
