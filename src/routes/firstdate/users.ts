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
  .post(
    "/register",
    async ({ user, body, status }) => {
      try {
        const data = await FdRegistrationService.registerFd(user, body);
        return successResponse(data);
      } catch (err) {
        if (err instanceof FdRegistrationService.FdRegistrationServiceError) {
          if (err.code === "BAD_REQUEST")
            return status(400, errorResponse("BAD_REQUEST", { message: err.message }));
          return status(500, errorResponse("INTERNAL_SERVER_ERROR"));
        }
        throw err;
      }
    },
    {
      auth: true,
      body: "FdUser.RegistrationBody",
      response: {
        200: "FdUser.RegistrationResponse",
        400: tErrorResponse("BAD_REQUEST", t.Object({ message: t.String() })),
        401: tErrorResponse("UNAUTHORIZED"),
        500: tErrorResponse("INTERNAL_SERVER_ERROR")
      }
    }
  )
  .get("/me", async ({ user }) => successResponse(await FdRegistrationService.getMe(user)), {
    auth: true,
    response: {
      200: "FdUser.MeResponse",
      401: tErrorResponse("UNAUTHORIZED")
    }
  });
