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
  // Standardize DTO validation failures into our envelope (422 error_validation)
  // instead of Elysia's default error shape.
  .onError(({ code, status }) => {
    if (code === "VALIDATION") {
      return status(422, errorResponse("VALIDATION", { message: "error_validation" }));
    }
  })
  .post(
    "/registration",
    async ({ user, body, status }) => {
      try {
        const data = await RpkmRegistrationService.registerRpkm(user, body);
        return successResponse(data);
      } catch (err) {
        if (err instanceof RpkmRegistrationService.RpkmRegistrationServiceError) {
          switch (err.code) {
            case "PDPA_REQUIRED":
              return status(400, errorResponse("PDPA_REQUIRED", { message: err.message }));
            case "BAD_REQUEST":
              return status(400, errorResponse("BAD_REQUEST", { message: err.message }));
            case "NOT_FRESHMEN":
              return status(403, errorResponse("NOT_FRESHMEN", { message: err.message }));
            case "ALREADY_REGISTERED":
              return status(409, errorResponse("ALREADY_REGISTERED", { message: err.message }));
            default:
              return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: "RpkmUser.RegistrationBody",
      response: {
        200: "RpkmUser.RegistrationResponse",
        400: t.Union([
          tErrorResponse("BAD_REQUEST", t.Object({ message: t.String() })),
          tErrorResponse("PDPA_REQUIRED", t.Object({ message: t.String() }))
        ]),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN", t.Object({ message: t.String() })),
        409: tErrorResponse("ALREADY_REGISTERED", t.Object({ message: t.String() })),
        422: tErrorResponse("VALIDATION", t.Object({ message: t.String() })),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  .get(
    "/me",
    async ({ user, status }) => {
      try {
        return successResponse(await RpkmRegistrationService.getMe(user));
      } catch (err) {
        if (
          err instanceof RpkmRegistrationService.RpkmRegistrationServiceError &&
          err.code === "NOT_FRESHMEN"
        ) {
          return status(403, errorResponse("NOT_FRESHMEN", { message: err.message }));
        }
        throw err;
      }
    },
    {
      auth: true,
      response: {
        200: "RpkmUser.MeResponse",
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN", t.Object({ message: t.String() }))
      }
    }
  );
