import { Elysia, t } from "elysia";

import { errorResponse, successResponse, tErrorResponse } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { FdRegistrationModel } from "@src/models/fd-registration.model";
import { FdRegistrationService } from "@src/services/fd-registration.service";

/**
 * FirstDate user routes — the registration flow (project=firstdate). Thin
 * controllers: auth guard → validate → call service → map to HTTP. Storage +
 * business rules live in FdRegistrationService (see docs/mvc.md). Mirrors
 * `src/routes/rpkm/users.ts` but FirstDate has no groups.
 *
 * Own Elysia instance so its model namespace ("FdUser.") is independent.
 */
export const firstdateUserRoutes = new Elysia({ prefix: "/fd/users" })
  .use(authMiddleware)
  .use(FdRegistrationModel)
  .prefix("model", "FdUser.")
  // Standardize errors into our envelope. Request-body validation -> 422
  // error_validation; a *response*-schema mismatch is a server bug, so it falls
  // through to the 500 envelope below.
  .onError(({ code, error, status }) => {
    if (code === "VALIDATION") {
      if ((error as { type?: string }).type === "response") {
        console.error("[fd registration] response schema mismatch:", error);
        return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
      return status(422, errorResponse("VALIDATION", { message: "error_validation" }));
    }
  })
  .post(
    "/registration",
    async ({ user, body, status }) => {
      try {
        const data = await FdRegistrationService.registerFd(user, body);
        return successResponse(data);
      } catch (err) {
        if (err instanceof FdRegistrationService.FdRegistrationServiceError) {
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
        // Unexpected (non-domain) error — keep the standard envelope.
        console.error("[fd registration] unexpected error:", err);
        return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
    },
    {
      auth: true,
      body: "FdUser.RegistrationBody",
      response: {
        200: "FdUser.RegistrationResponse",
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
  // Any authenticated user may read their own debloated info (no freshman/staff gate).
  .get(
    "/me",
    async ({ user, status }) => {
      try {
        return successResponse(await FdRegistrationService.getMe(user));
      } catch (err) {
        if (err instanceof FdRegistrationService.FdRegistrationServiceError) {
          if (err.code === "NOT_FRESHMEN") {
            return status(403, errorResponse("NOT_FRESHMEN", { message: err.message }));
          }
        }
        console.error("[fd /me] unexpected error:", err);
        return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
      }
    },
    {
      auth: true,
      response: {
        200: "FdUser.MeResponse",
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN", t.Object({ message: t.String() })),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  // Detailed registration profile prefill
  .get(
    "/profile",
    async ({ user }) => successResponse(await FdRegistrationService.getProfile(user)),
    {
      auth: true,
      response: {
        200: "FdUser.ProfileResponse",
        401: tErrorResponse("UNAUTHORIZED"),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  .patch(
    "/profile",
    async ({ user, body }) =>
      successResponse(await FdRegistrationService.updateProfile(user, body)),
    {
      auth: true,
      body: "FdUser.UpdateProfileBody",
      response: {
        200: "FdUser.ProfileResponse",
        400: tErrorResponse("BAD_REQUEST", t.Object({ message: t.String() })),
        401: tErrorResponse("UNAUTHORIZED"),
        404: tErrorResponse("NOT_FOUND", t.Object({ message: t.String() })),
        422: tErrorResponse("VALIDATION", t.Object({ message: t.String() })),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  );
