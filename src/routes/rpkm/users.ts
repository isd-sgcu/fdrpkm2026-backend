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
  // Standardize errors into our envelope. Request-body validation -> 422
  // error_validation; a *response*-schema mismatch is a server bug, not the
  // client's fault, so it falls through to the 500 envelope below.
  .onError(({ code, error, status }) => {
    if (code === "VALIDATION") {
      if ((error as { type?: string }).type === "response") {
        console.error("[rpkm registration] response schema mismatch:", error);
        return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
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
            case "FORBIDDEN":
              return status(403, errorResponse("FORBIDDEN", { message: err.message }));
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
        200: "RpkmUser.RegistrationResponse",
        400: t.Union([
          tErrorResponse("BAD_REQUEST", t.Object({ message: t.String() })),
          tErrorResponse("PDPA_REQUIRED", t.Object({ message: t.String() }))
        ]),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("FORBIDDEN", t.Object({ message: t.String() })),
        409: tErrorResponse("ALREADY_REGISTERED", t.Object({ message: t.String() })),
        422: tErrorResponse("VALIDATION", t.Object({ message: t.String() })),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  // Any authenticated user may read their own debloated info (no freshman/staff gate).
  .get(
    "/me",
    async ({ user, status }) => {
      try {
        return successResponse(await RpkmRegistrationService.getMe(user));
      } catch (err) {
        console.error("[rpkm /me] unexpected error:", err);
        return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
    },
    {
      auth: true,
      response: {
        200: "RpkmUser.MeResponse",
        401: tErrorResponse("UNAUTHORIZED"),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  // Detailed registration profile prefill
  .get(
    "/profile",
    async ({ user, status }) => {
      try {
        return successResponse(await RpkmRegistrationService.getProfile(user));
      } catch (err) {
        console.error("[rpkm /profile] unexpected error:", err);
        return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
    },
    {
      auth: true,
      response: {
        200: "RpkmUser.ProfileResponse",
        401: tErrorResponse("UNAUTHORIZED"),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  );
