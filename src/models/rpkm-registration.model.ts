import { Elysia, t } from "elysia";

import { vehicleEnum } from "@src/db/schema";
import { tSuccessResponse } from "@src/utils";

/**
 * DTOs for the RPKM registration flow (POST /v1/rpkm/users/registration,
 * GET /v1/rpkm/users/me). Schema-only — no logic, no I/O (see docs/mvc.md).
 *
 * Field names are camelCase to stay consistent with the rest of the API
 * (e.g. GET /v1/rpkm/houses, whose shape comes straight off the Drizzle
 * columns) rather than the snake_case sketch in the task note.
 *
 * No self-prefix here — the consuming route applies its own namespace via
 * `.use(RpkmRegistrationModel).prefix("model", "RpkmUser.")`, so the schemas
 * are referenced as "RpkmUser.RegistrationBody" etc. (capitalized first
 * letter — that's what `.prefix("model", …)` does to the keys).
 */

// Kept in sync with the DB enum instead of a hand-listed union, so adding a
// vehicle in enums.ts flows here automatically. Built with t.Enum (same
// pattern as ExampleModel's userRole) — t.Union over a mapped *array* of
// literals resolves its static type to `never`, which broke response
// inference; t.Enum over the {value: value} map resolves cleanly.
const vehicleValues = Object.fromEntries(vehicleEnum.enumValues.map((value) => [value, value])) as {
  [K in (typeof vehicleEnum.enumValues)[number]]: K;
};
const vehicle = t.Enum(vehicleValues, {
  title: "Vehicle",
  description: "Travel method code; 'other' requires vehicleOther."
});

// One carbon/travel leg as sent by the frontend. `seq` and `registrationId`
// are assigned by the server, not the client. origin/destination are
// frontend-owned free text (schema-spec: not validated in the backend), and
// the last leg's destination is overwritten server-side to Pathum Wan /
// Bangkok — so they're optional here (a client needn't send the fixed final
// destination). Only `vehicle` is required (NOT NULL enum).
const travelLegInput = t.Object({
  vehicle,
  vehicleOther: t.Optional(t.Nullable(t.String())),
  originDistrict: t.Optional(t.String({ title: "Origin district" })),
  originProvince: t.Optional(t.String({ title: "Origin province" })),
  destinationDistrict: t.Optional(t.String({ title: "Destination district" })),
  destinationProvince: t.Optional(t.String({ title: "Destination province" }))
});

// travel_legs is capped at 2 by the DB (CHECK seq in (1,2)); enforce it here
// too so an over-long list fails validation (400) before touching the DB.
const registrationBody = t.Object({
  pdpaConsent: t.Boolean({
    title: "PDPA consent",
    description: "Must be true to register."
  }),
  pnoSgcuAwareness: t.Optional(t.Nullable(t.String())),
  pnoReferralSource: t.Optional(t.Nullable(t.String())),
  travelLegs: t.Optional(t.Array(travelLegInput, { maxItems: 2, title: "Travel legs" }))
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

// Stable shape for prefill: registration/group are null (not omitted) and
// travelLegs is [] when the user hasn't registered yet, so the frontend
// never has to branch on missing keys.
const meResult = t.Object({
  user: meUser,
  registration: t.Nullable(meRegistration),
  travelLegs: t.Array(travelLegView),
  group: t.Nullable(groupView)
});

// Register the full `{ success, data }` envelopes (not the bare data schemas)
// so routes reference a concrete schema by string — wrapping a `t.Ref` inside
// tSuccessResponse at the route level doesn't resolve its static type, which
// degrades the handler's return-type inference.
export const RpkmRegistrationModel = new Elysia().model({
  registrationBody,
  registrationResponse: tSuccessResponse(registrationResult),
  meResponse: tSuccessResponse(meResult)
});
