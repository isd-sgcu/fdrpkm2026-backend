import { Elysia, t } from "elysia";

import { vehicleEnum } from "@src/db/schema";
import { tSuccessResponse } from "@src/utils";

/**
 * DTOs for the FirstDate registration flow (POST /v1/fd/users/register,
 * GET /v1/fd/users/me). Schema-only (see docs/mvc.md). Same field shapes as
 * the RPKM model but with NO group — FirstDate has no groups (group_id stays
 * null). camelCase, consistent with the rest of the API.
 *
 * The schemas are intentionally duplicated (not imported from the RPKM model):
 * sharing one t.* node across two Elysia model instances risks Elysia's
 * `.prefix("model", …)` deep-clone collapsing a static type to `never`. The
 * shared *logic* lives in the registration core service, not here.
 *
 * Consuming route applies the namespace via
 * `.use(FdRegistrationModel).prefix("model", "FdUser.")`.
 */

// t.Enum (not t.Union over a mapped array, which resolves to `never` under the
// prefix clone). Kept in sync with the DB enum.
const vehicleValues = Object.fromEntries(vehicleEnum.enumValues.map((value) => [value, value])) as {
  [K in (typeof vehicleEnum.enumValues)[number]]: K;
};
const vehicle = t.Enum(vehicleValues, {
  title: "Vehicle",
  description: "Travel method code; 'other' requires vehicleOther."
});

const travelLegInput = t.Object({
  vehicle,
  vehicleOther: t.Optional(t.Nullable(t.String())),
  originDistrict: t.Optional(t.String({ title: "Origin district" })),
  originProvince: t.Optional(t.String({ title: "Origin province" })),
  destinationDistrict: t.Optional(t.String({ title: "Destination district" })),
  destinationProvince: t.Optional(t.String({ title: "Destination province" }))
});

// travel_legs is capped at 2 by the DB (CHECK seq in (1,2)).
const registrationBody = t.Object({
  pdpaConsent: t.Boolean({ title: "PDPA consent", description: "Must be true to register." }),
  pnoSgcuAwareness: t.Optional(t.Nullable(t.String())),
  pnoReferralSource: t.Optional(t.Nullable(t.String())),
  travelLegs: t.Optional(t.Array(travelLegInput, { maxItems: 2, title: "Travel legs" }))
});

const registrationResult = t.Object({
  userId: t.String({ format: "uuid" }),
  registrationId: t.String({ format: "uuid" })
});

const meUser = t.Object({
  // students uuid once registered; null before the students row exists.
  id: t.Nullable(t.String()),
  studentCode: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  year: t.Nullable(t.String())
});

const meRegistration = t.Object({
  pdpaConsent: t.Boolean(),
  pnoSgcuAwareness: t.Nullable(t.String()),
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

// Stable shape for prefill (registration null + travelLegs [] when unregistered).
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
