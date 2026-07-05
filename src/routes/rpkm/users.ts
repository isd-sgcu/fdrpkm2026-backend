import { Elysia, t } from "elysia";

import { errorResponse, successResponse, tErrorResponse } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { RpkmRegistrationModel } from "@src/models/rpkm-registration.model";
import { RpkmRegistrationService } from "@src/services/rpkm-registration.service";

/**
 * RPKM user routes — the registration flow (project=rpkm). Thin controllers:
 * auth guard (via the `auth: true` macro) → validate (via the model schemas)
 * → call the service → map result/error to HTTP. All storage + business
 * rules live in RpkmRegistrationService (see docs/mvc.md).
 *
 * Kept as its own Elysia instance (not folded into rpkmRoutes) so its model
 * namespace ("RpkmUser.") stays independent of the houses model's ("Rpkm.")
 * — stacking two `.prefix("model", …)` calls on one instance double-prefixes.
 */
export const rpkmUserRoutes = new Elysia({ prefix: "/rpkm/users" })
  .use(authMiddleware)
  .use(RpkmRegistrationModel)
  .prefix("model", "RpkmUser.")
  .post(
    "/registration",
    async ({ user, body, status }) => {
      try {
        const data = await RpkmRegistrationService.registerRpkm(user, body);
        return successResponse(data);
      } catch (err) {
        if (err instanceof RpkmRegistrationService.RpkmRegistrationServiceError) {
          if (err.code === "BAD_REQUEST")
            return status(400, errorResponse("BAD_REQUEST", { message: err.message }));
          return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
        }
        throw err;
      }
    },
    {
      auth: true,
      body: "RpkmUser.RegistrationBody",
      response: {
        200: "RpkmUser.RegistrationResponse",
        400: tErrorResponse("BAD_REQUEST", t.Object({ message: t.String() })),
        401: tErrorResponse("UNAUTHORIZED"),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  .get("/me", async ({ user }) => successResponse(await RpkmRegistrationService.getMe(user)), {
    auth: true,
    response: {
      200: "RpkmUser.MeResponse",
      401: tErrorResponse("UNAUTHORIZED")
    }
  });
