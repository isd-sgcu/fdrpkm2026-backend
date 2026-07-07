import { Elysia, t } from "elysia";
import { errorResponse, tErrorResponse } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { FirstDateService } from "@src/services/firstdate.service";
import { CheckinError } from "@src/services/checkin.helper";

/**
 * FirstDate-only routes. project context = 'firstdate'.
 * e.g. registration, My-QR, staff entry scan (entries, project=firstdate).
 */
export const firstdateRoutes = new Elysia({ prefix: "/fd" })
  // put auth here so the types are inferred correctly in the route handlers below. The auth macro is available as `ctx.auth` in handlers.
  .use(authMiddleware)
  .get("/", ({ user }) => FirstDateService.getFirstDateProfile(user), {
    // add auth: true so it check session and user/session var is available in the handler.
    auth: true,
    response: {
      200: t.Object({
        name: t.String({
          title: "Name",
          example: ["John Doe", "Jane Doe"]
        })
      }),
      401: tErrorResponse("UNAUTHORIZED", t.Object({ message: t.String() }))
    }
  })
  .post(
    "/checkin/freshmennight",
    async ({ user, body, status }) => {
      try {
        const staffCunetId = user.email?.split("@")[0] ?? "";
        const entry = await FirstDateService.checkinFreshmenNight(staffCunetId, body.student_id);
        return { success: true as const, data: entry };
      } catch (err) {
        if (err instanceof FirstDateService.FirstDateServiceError || err instanceof CheckinError) {
          switch (err.code) {
            case "STUDENT_NOT_FOUND":
              return status(404, errorResponse("STUDENT_NOT_FOUND"));
            case "FORBIDDEN_NOT_STAFF":
              return status(403, errorResponse("FORBIDDEN_NOT_STAFF"));
            case "ALREADY_CHECKED_IN":
              return status(409, errorResponse("ALREADY_CHECKED_IN"));
            default:
              throw err;
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: t.Object({ student_id: t.String({ minLength: 1 }) }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ id: t.String() })
        }),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("FORBIDDEN_NOT_STAFF"),
        404: tErrorResponse("STUDENT_NOT_FOUND"),
        409: tErrorResponse("ALREADY_CHECKED_IN")
      }
    }
  );
