import { Elysia, t } from "elysia";

import { tSuccessResponse } from "@src/utils";
import { registrationFields } from "./registration-fields";

/**
 * DTOs for the RPKM registration flow (POST /v1/rpkm/users/registration,
 * GET /v1/rpkm/users/me). Schema-only (see docs/mvc.md). Shared field nodes
 * come from `registrationFields()` (fresh per call); RPKM adds `group`.
 *
 * Consuming route applies its namespace via
 * `.use(RpkmRegistrationModel).prefix("model", "RpkmUser.")`.
 */
const f = registrationFields();

const rpkmRegistrationBody = t.Composite([
  f.registrationBody,
  t.Object({
    attendedDays: t.Integer({ title: "Attended days" })
  })
]);

const rpkmRegistration = t.Composite([
  f.meRegistration,
  t.Object({
    attendedDays: t.Nullable(t.Integer())
  })
]);

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

// Stable shape: registration/group null + travelLegs [] when unregistered.
const profileResult = t.Object({
  user: f.meUser,
  registration: t.Nullable(rpkmRegistration),
  travelLegs: t.Array(f.travelLegView),
  group: t.Nullable(groupView)
});

export type RpkmProfileResult = (typeof profileResult)["static"];

const meResult = t.Object({
  id: t.Nullable(t.String()),
  studentId: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  role: t.String(),
  registered: t.Boolean()
});

export const RpkmRegistrationModel = new Elysia().model({
  registrationBody: rpkmRegistrationBody,
  updateProfileBody: t.Partial(rpkmRegistrationBody),
  registrationResponse: tSuccessResponse(registrationResult),
  meResponse: tSuccessResponse(meResult),
  profileResponse: tSuccessResponse(profileResult)
});
