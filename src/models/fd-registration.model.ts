import { Elysia, t } from "elysia";

import { prefixEnum, vehicleEnum } from "@src/db/schema";
import { tSuccessResponse } from "@src/utils";

/**
 * DTOs for the FirstDate registration flow (POST /v1/fd/users/register,
 * GET /v1/fd/users/me). Schema-only (see docs/mvc.md). Same field shapes as the
 * RPKM model but with NO group — FirstDate has no groups (group_id stays null).
 *
 * Schemas are intentionally duplicated (not imported from the RPKM model):
 * sharing one t.* node across two Elysia model instances risks the
 * `.prefix("model", …)` deep-clone collapsing a static type to `never`. The
 * shared *logic* lives in the registration core service, not here.
 *
 * Consuming route applies the namespace via
 * `.use(FdRegistrationModel).prefix("model", "FdUser.")`.
 */

const enumSchema = <T extends readonly string[]>(values: T, title: string) =>
  t.Enum(Object.fromEntries(values.map((v) => [v, v])) as { [K in T[number]]: K }, { title });

const vehicle = enumSchema(vehicleEnum.enumValues, "Vehicle");
const prefix = enumSchema(prefixEnum.enumValues, "Prefix");

// Full-form contract: every field required + non-null, EXCEPT `vehicleOther`
// (conditional: required iff vehicle = 'other', forbidden otherwise — DB CHECK).
const travelLegInput = t.Object({
  vehicle,
  vehicleOther: t.Optional(t.Nullable(t.String())),
  originDistrict: t.String({ title: "Origin district" }),
  originProvince: t.String({ title: "Origin province" }),
  destinationDistrict: t.String({ title: "Destination district" }),
  destinationProvince: t.String({ title: "Destination province" })
});

// Full-form POST body: every field required + non-null (send "" for blanks).
// travelLegs: 1..4 (DB CHECK seq in (1,2,3,4)).
const registrationBody = t.Object({
  pdpaConsent: t.Boolean({ title: "PDPA consent", description: "Must be true to register." }),
  prefix,
  firstName: t.String({ title: "First name" }),
  lastName: t.String({ title: "Last name" }),
  nickname: t.String({ title: "Nickname" }),
  faculty: t.String({ title: "Faculty" }),
  phone: t.String({ title: "Phone" }),
  emergencyContactName: t.String({ title: "Emergency contact name" }),
  emergencyContactPhone: t.String({ title: "Emergency contact phone" }),
  allergies: t.String({ title: "Allergies" }),
  dietary: t.String({ title: "Dietary" }),
  medicalNotes: t.String({ title: "Medical notes" }),
  pnoSgcuAwareness: t.String({ title: "SGCU awareness" }),
  pnoReferralSource: t.String({ title: "Referral source" }),
  travelLegs: t.Array(travelLegInput, { minItems: 1, maxItems: 4, title: "Travel legs" })
});

const registrationResult = t.Object({
  userId: t.String({ format: "uuid" }),
  registrationId: t.String({ format: "uuid" })
});

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

const meResult = t.Object({
  user: meUser,
  registration: t.Nullable(meRegistration),
  travelLegs: t.Array(travelLegView)
});

export const FdRegistrationModel = new Elysia().model({
  registrationBody,
  registrationResponse: tSuccessResponse(registrationResult),
  meResponse: tSuccessResponse(meResult)
});
