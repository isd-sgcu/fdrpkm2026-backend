import { Elysia, t } from "elysia";

import { registrationFields } from "./registration-fields";

/**
 * DTOs for the FirstDate registration flow (POST /v1/fd/users/registration,
 * GET /v1/fd/users/me). Schema-only (see docs/mvc.md). Same shared field nodes
 * as RPKM (via `registrationFields()`), but with NO group — FirstDate has no
 * groups (group_id stays null).
 *
 * Consuming route applies the namespace via
 * `.use(FdRegistrationModel).prefix("model", "FdUser.")`.
 */
const f = registrationFields();

const registrationResult = t.Object({
  userId: t.String({ format: "uuid" }),
  registrationId: t.String({ format: "uuid" })
});

const profileResult = t.Object({
  user: f.meUser,
  registration: t.Nullable(f.meRegistration),
  travelLegs: t.Array(f.travelLegView)
});

export type FdProfileResult = (typeof profileResult)["static"];

const meResult = t.Object({
  id: t.Nullable(t.String()),
  studentId: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  faculty: t.Nullable(t.String()),
  role: t.String(),
  registered: t.Boolean(),
  staffRole: t.Nullable(t.String())
});

export const FdRegistrationModel = new Elysia().model({
  registrationBody: f.registrationBody,
  updateProfileBody: t.Partial(f.registrationBody),
  registrationResult,
  meResult,
  profileResult
});
