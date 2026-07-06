import { Elysia, t } from "elysia";

import { prefixEnum, vehicleEnum } from "@src/db/schema";
import { tSuccessResponse } from "@src/utils";

/**
 * DTOs for the RPKM registration flow (POST /v1/rpkm/users/registration,
 * GET /v1/rpkm/users/me). Schema-only — no logic, no I/O (see docs/mvc.md).
 * camelCase, consistent with the rest of the API.
 *
 * Consuming route applies its namespace via
 * `.use(RpkmRegistrationModel).prefix("model", "RpkmUser.")`.
 */

// t.Enum (not t.Union over a mapped array, which resolves to `never` under the
// prefix clone). Kept in sync with the DB enums.
const enumSchema = <T extends readonly string[]>(values: T, title: string) =>
  t.Enum(Object.fromEntries(values.map((v) => [v, v])) as { [K in T[number]]: K }, { title });

const vehicle = enumSchema(vehicleEnum.enumValues, "Vehicle");
const prefix = enumSchema(prefixEnum.enumValues, "Prefix");

// One travel leg. `seq`/`registrationId` are server-assigned. origin/dest are
// frontend-owned free text; only the 4th leg of a 4-leg journey is server-fixed.
const travelLegInput = t.Object({
  vehicle,
  vehicleOther: t.Optional(t.Nullable(t.String())),
  originDistrict: t.Optional(t.String({ title: "Origin district" })),
  originProvince: t.Optional(t.String({ title: "Origin province" })),
  destinationDistrict: t.Optional(t.String({ title: "Destination district" })),
  destinationProvince: t.Optional(t.String({ title: "Destination province" }))
});

// travelLegs: 1..4 (DB CHECK seq in (1,2,3,4)). Profile fields write to
// `students` (shared identity); student_id/email stay derived from auth.
const registrationBody = t.Object({
  pdpaConsent: t.Boolean({ title: "PDPA consent", description: "Must be true to register." }),
  firstName: t.Optional(t.String({ title: "First name" })),
  lastName: t.Optional(t.String({ title: "Last name" })),
  prefix: t.Optional(prefix),
  nickname: t.Optional(t.Nullable(t.String())),
  faculty: t.Optional(t.Nullable(t.String())),
  phone: t.Optional(t.Nullable(t.String())),
  emergencyContactName: t.Optional(t.Nullable(t.String())),
  emergencyContactPhone: t.Optional(t.Nullable(t.String())),
  allergies: t.Optional(t.Nullable(t.String())),
  dietary: t.Optional(t.Nullable(t.String())),
  medicalNotes: t.Optional(t.Nullable(t.String())),
  pnoSgcuAwareness: t.Optional(t.Nullable(t.String())),
  pnoReferralSource: t.Optional(t.Nullable(t.String())),
  travelLegs: t.Array(travelLegInput, { minItems: 1, maxItems: 4, title: "Travel legs" })
});

const groupView = t.Object({
  id: t.String({ format: "uuid" }),
  leaderId: t.String({ format: "uuid" }),
  joinCode: t.String({ title: "Join code", description: "6 chars, A-Z + 0-9." }),
  assignedHouseId: t.Nullable(t.String({ format: "uuid" }))
});

const registrationResult = t.Object({
  userId: t.String({ format: "uuid" }),
  registrationId: t.String({ format: "uuid" }),
  group: groupView
});

// Full profile for prefill — pnoSgcuAwareness lives here (it's a `students`
// field), so the frontend can prefill it even before a registration exists.
const meUser = t.Object({
  id: t.Nullable(t.String()),
  studentCode: t.String(),
  prefix: t.Nullable(t.String()),
  firstName: t.String(),
  lastName: t.String(),
  nickname: t.Nullable(t.String()),
  faculty: t.Nullable(t.String()),
  year: t.Nullable(t.String()),
  phone: t.Nullable(t.String()),
  emergencyContactName: t.Nullable(t.String()),
  emergencyContactPhone: t.Nullable(t.String()),
  allergies: t.Nullable(t.String()),
  dietary: t.Nullable(t.String()),
  medicalNotes: t.Nullable(t.String()),
  pnoSgcuAwareness: t.Nullable(t.String())
});

const meRegistration = t.Object({
  pdpaConsent: t.Boolean(),
  pnoReferralSource: t.Nullable(t.String())
});

const travelLegView = t.Object({
  seq: t.Integer(),
  vehicle,
  vehicleOther: t.Nullable(t.String()),
  originDistrict: t.String(),
  originProvince: t.String(),
  destinationDistrict: t.String(),
  destinationProvince: t.String()
});

// Stable shape: registration/group null + travelLegs [] when unregistered.
const meResult = t.Object({
  user: meUser,
  registration: t.Nullable(meRegistration),
  travelLegs: t.Array(travelLegView),
  group: t.Nullable(groupView)
});

export const RpkmRegistrationModel = new Elysia().model({
  registrationBody,
  registrationResponse: tSuccessResponse(registrationResult),
  meResponse: tSuccessResponse(meResult)
});
