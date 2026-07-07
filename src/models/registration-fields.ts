import { t } from "elysia";

import { prefixEnum, vehicleEnum } from "@src/db/schema";

/**
 * Shared registration DTO field schemas for FirstDate + RPKM. Their request
 * body and `/me` shapes are identical except RPKM adds a `group` — so the field
 * nodes live here once instead of being copy-pasted into both model files.
 *
 * IMPORTANT: this is a **factory** — it returns FRESH `t.*` nodes on every call.
 * Sharing one node instance across two Elysia `.model({...})` instances makes
 * `.prefix("model", …)`'s deep-clone collapse its static type to `never` (see
 * docs/mvc.md). Each consuming model must call `registrationFields()` once and
 * use its own set.
 */

const enumSchema = <T extends readonly string[]>(values: T, title: string) =>
  t.Enum(Object.fromEntries(values.map((v) => [v, v])) as { [K in T[number]]: K }, { title });

export const registrationFields = () => {
  const vehicle = enumSchema(vehicleEnum.enumValues, "Vehicle");
  const prefix = enumSchema(prefixEnum.enumValues, "Prefix");

  // One travel leg. Full-form contract: every field required + non-null EXCEPT
  // `vehicleOther` (conditional: required iff vehicle === 'other', DB CHECK).
  const travelLegInput = t.Object({
    vehicle,
    vehicleOther: t.Optional(t.Nullable(t.String())),
    originDistrict: t.String({ title: "Origin district" }),
    originProvince: t.String({ title: "Origin province" }),
    destinationDistrict: t.String({ title: "Destination district" }),
    destinationProvince: t.String({ title: "Destination province" })
  });

  // Full-form POST body: every field required + non-null (send "" for blanks).
  // Profile fields write to `students`; student_id/email stay derived from auth.
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

  // Full profile for prefill — pnoSgcuAwareness lives here (a `students` field),
  // so the frontend can prefill it even before a registration exists.
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

  return { registrationBody, meUser, meRegistration, travelLegView };
};
