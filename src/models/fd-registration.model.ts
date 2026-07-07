import { Elysia, t } from "elysia";

import { tSuccessResponse } from "@src/utils";
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

const meResult = t.Object({
  id: t.Nullable(t.String()),
  studentId: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  role: t.String(),
  registered: t.Boolean()
});

export const FdRegistrationModel = new Elysia().model({
  registrationBody: f.registrationBody,
  registrationResponse: tSuccessResponse(registrationResult),
  meResponse: tSuccessResponse(meResult),
  profileResponse: tSuccessResponse(profileResult)
});
