import { Elysia } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { RpkmService } from "@src/services/rpkm.service";
import { errorResponse, tErrorResponse, tSuccessResponse } from "@src/utils";
import { CheckinError } from "@src/services/checkin.helper";
import { CheckinModel } from "@src/models/checkin.model";

export const rpkmCheckinRoutes = new Elysia({ prefix: "/checkin" })
  .use(authMiddleware)
  .use(CheckinModel)
  .prefix("model", "Checkin.")
  .post(
    "/registration",
    async ({ user, body, status }) => {
      try {
        const staffCunetId = user.email?.split("@")[0] ?? "";
        const entry = await RpkmService.checkinRegistration(staffCunetId, body.student_id);
        return { success: true as const, data: entry };
      } catch (err) {
        if (err instanceof CheckinError) {
          switch (err.code) {
            case "STUDENT_NOT_FOUND":
              return status(404, errorResponse("STUDENT_NOT_FOUND"));
            case "FORBIDDEN_NOT_STAFF":
              return status(403, errorResponse("FORBIDDEN_NOT_STAFF"));
            case "ALREADY_CHECKED_IN":
              return status(409, errorResponse("ALREADY_CHECKED_IN", err.context));
            default:
              throw err;
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: "Checkin.CheckinBody",
      response: {
        200: tSuccessResponse(CheckinModel.models.Entry.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("FORBIDDEN_NOT_STAFF"),
        404: tErrorResponse("STUDENT_NOT_FOUND"),
        409: tErrorResponse(
          "ALREADY_CHECKED_IN",
          CheckinModel.models.AlreadyCheckedInContext.Schema()
        )
      }
    }
  )
  .post(
    "/freshmennight",
    async ({ user, body, status }) => {
      try {
        const staffCunetId = user.email?.split("@")[0] ?? "";
        const entry = await RpkmService.checkinFreshmenNight(staffCunetId, body.student_id);
        return { success: true as const, data: entry };
      } catch (err) {
        if (err instanceof CheckinError) {
          switch (err.code) {
            case "STUDENT_NOT_FOUND":
              return status(404, errorResponse("STUDENT_NOT_FOUND"));
            case "FORBIDDEN_NOT_STAFF":
              return status(403, errorResponse("FORBIDDEN_NOT_STAFF"));
            case "ALREADY_CHECKED_IN":
              return status(409, errorResponse("ALREADY_CHECKED_IN", err.context));
            default:
              throw err;
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: "Checkin.CheckinBody",
      response: {
        200: tSuccessResponse(CheckinModel.models.Entry.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("FORBIDDEN_NOT_STAFF"),
        404: tErrorResponse("STUDENT_NOT_FOUND"),
        409: tErrorResponse(
          "ALREADY_CHECKED_IN",
          CheckinModel.models.AlreadyCheckedInContext.Schema()
        )
      }
    }
  );
