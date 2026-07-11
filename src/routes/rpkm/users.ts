import { Elysia, t } from "elysia";

import { errorResponse, successResponse, tErrorResponse, tSuccessResponse } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { RpkmRegistrationModel } from "@src/models/rpkm-registration.model";
import { RpkmService } from "@src/services/rpkm.service";

/**
 * RPKM user routes — the registration flow (project=rpkm). Thin controllers:
 * auth guard (via the `auth: true` macro) → validate (via the model schemas)
 * → call the service → map result/error to HTTP. All storage + business
 * rules live in RpkmService (see docs/mvc.md).
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
        const data = await RpkmService.registerRpkm(user, body);
        return successResponse(data);
      } catch (err) {
        if (err instanceof RpkmService.RpkmServiceError) {
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
        // Unexpected (non-domain) error — keep the standard envelope, don't
        // leak Elysia's default error body.
        console.error("[rpkm registration] unexpected error:", err);
        return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
    },
    {
      auth: true,
      body: "RpkmUser.RegistrationBody",
      response: {
        200: tSuccessResponse(RpkmRegistrationModel.models.registrationResult.Schema()),
        400: t.Union([
          tErrorResponse("BAD_REQUEST", t.Object({ message: t.String() })),
          tErrorResponse("PDPA_REQUIRED", t.Object({ message: t.String() }))
        ]),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN", t.Object({ message: t.String() })),
        409: tErrorResponse("ALREADY_REGISTERED", t.Object({ message: t.String() })),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  // Any authenticated user may read their own debloated info (no freshman/staff gate).
  .get(
    "/me",
    async ({ user, status }) => {
      try {
        return successResponse(await RpkmService.getMe(user));
      } catch (err) {
        if (err instanceof RpkmService.RpkmServiceError) {
          if (err.code === "NOT_FRESHMEN") {
            return status(403, errorResponse("NOT_FRESHMEN", { message: err.message }));
          }
        }
        console.error("[rpkm /me] unexpected error:", err);
        return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
    },
    {
      auth: true,
      response: {
        200: tSuccessResponse(RpkmRegistrationModel.models.meResult.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN", t.Object({ message: t.String() })),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  // Detailed registration profile prefill
  .get("/profile", async ({ user }) => successResponse(await RpkmService.getProfile(user)), {
    auth: true,
    response: {
      200: tSuccessResponse(RpkmRegistrationModel.models.profileResult.Schema()),
      401: tErrorResponse("UNAUTHORIZED"),
      500: tErrorResponse("INTERNAL_SERVER_ERROR")
    }
  })
  .patch(
    "/profile",
    async ({ user, body }) => successResponse(await RpkmService.updateProfile(user, body)),
    {
      auth: true,
      body: "RpkmUser.UpdateProfileBody",
      response: {
        200: tSuccessResponse(RpkmRegistrationModel.models.profileResult.Schema()),
        400: tErrorResponse("BAD_REQUEST", t.Object({ message: t.String() })),
        401: tErrorResponse("UNAUTHORIZED"),
        404: tErrorResponse("NOT_FOUND", t.Object({ message: t.String() })),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  );
