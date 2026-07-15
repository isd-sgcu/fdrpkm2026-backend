import { Elysia } from "elysia";

import { successResponse, tAppErrors, tSuccessResponse } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { FdRegistrationModel } from "@src/models/fd-registration.model";
import { FirstDateService } from "@src/services/firstdate.service";

/**
 * FirstDate user routes — the registration flow (project=firstdate). Thin
 * controllers: auth guard → validate → call service. Storage + business rules
 * live in FirstDateService (see docs/mvc.md); business failures are AppErrors
 * handled by the global onError (src/app.ts). Mirrors
 * `src/routes/rpkm/users.ts` but FirstDate has no groups.
 *
 * Own Elysia instance so its model namespace ("FdUser.") is independent.
 */
export const firstdateUserRoutes = new Elysia({ prefix: "/fd/users" })
  .use(authMiddleware)
  .use(FdRegistrationModel)
  .prefix("model", "FdUser.")
  .post(
    "/registration",
    async ({ user, body }) => successResponse(FirstDateService.registerFd(user, body)),
    {
      auth: true,
      body: "FdUser.RegistrationBody",
      response: {
        200: tSuccessResponse(FdRegistrationModel.models.registrationResult.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "ALREADY_REGISTERED",
          "INTERNAL_SERVER_ERROR"
        )
      }
    }
  )
  // Any authenticated user may read their own debloated info (no freshman/staff gate).
  .get("/me", async ({ user }) => successResponse(FirstDateService.getMe(user)), {
    auth: true,
    response: {
      200: tSuccessResponse(FdRegistrationModel.models.meResult.Schema()),
      ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN")
    }
  })
  // Detailed registration profile prefill
  .get("/profile", async ({ user }) => successResponse(FirstDateService.getProfile(user)), {
    auth: true,
    response: {
      200: tSuccessResponse(FdRegistrationModel.models.profileResult.Schema()),
      ...tAppErrors("UNAUTHORIZED")
    }
  })
  .patch(
    "/profile",
    async ({ user, body }) => successResponse(FirstDateService.updateProfile(user, body)),
    {
      auth: true,
      body: "FdUser.UpdateProfileBody",
      response: {
        200: tSuccessResponse(FdRegistrationModel.models.profileResult.Schema()),
        ...tAppErrors("VALIDATION", "UNAUTHORIZED", "NOT_FOUND")
      }
    }
  );
