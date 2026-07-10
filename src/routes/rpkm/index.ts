import { Elysia, t } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { gameRoute } from "./games";
import { groupRoute } from "./groups";
import { houseRoute } from "./houses";
import { RpkmCheckinService } from "@src/services/rpkm-checkin.service";
import { errorResponse, tErrorResponse } from "@src/utils";
import { CheckinError } from "@src/services/checkin.helper";

/**
 * RPKM-only routes. project context = 'rpkm'.
 * e.g. registration, houses + groups, jigsaw/CSR scans, static activities.
 */
export const rpkmRoutes = new Elysia({ prefix: "/rpkm" })
  .use(authMiddleware)
  .use(groupRoute)
  .use(houseRoute)
  .use(gameRoute)
  .get("/", () => ({ project: "rpkm" }), { auth: true })
  .post(
    "/checkin/registration",
    async ({ user, body, status }) => {
      try {
        const staffCunetId = user.email?.split("@")[0] ?? "";
        const entry = await RpkmCheckinService.checkinRegistration(staffCunetId, body.student_id);
        return { success: true as const, data: entry };
      } catch (err) {
        if (err instanceof CheckinError) {
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
  )
  .post(
    "/checkin/freshmennight",
    async ({ user, body, status }) => {
      try {
        const staffCunetId = user.email?.split("@")[0] ?? "";
        const entry = await RpkmCheckinService.checkinFreshmenNight(staffCunetId, body.student_id);
        return { success: true as const, data: entry };
      } catch (err) {
        if (err instanceof CheckinError) {
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
