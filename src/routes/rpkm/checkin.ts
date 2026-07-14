import { Elysia } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { RpkmService } from "@src/services/rpkm.service";
import { successResponse, tAppErrors, tSuccessResponse } from "@src/utils";
import { CheckinModel } from "@src/models/checkin.model";

// ALREADY_CHECKED_IN carries its typed context (scannedAt/scannedBy) — the
// schema comes from AppErrorContext via tAppErrors, the payload from the
// AppError thrown in checkin.helper.ts.
export const rpkmCheckinRoutes = new Elysia({ prefix: "/checkin" })
  .use(authMiddleware)
  .use(CheckinModel)
  .prefix("model", "Checkin.")
  .post(
    "/registration",
    async ({ user, body }) => {
      const staffCunetId = user.email?.split("@")[0] ?? "";
      return successResponse(await RpkmService.checkinRegistration(staffCunetId, body.student_id));
    },
    {
      auth: true,
      body: "Checkin.CheckinBody",
      response: {
        200: tSuccessResponse(CheckinModel.models.Entry.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "UNAUTHORIZED",
          "FORBIDDEN_NOT_STAFF",
          "STUDENT_NOT_FOUND",
          "ALREADY_CHECKED_IN"
        )
      }
    }
  )
  .post(
    "/freshmennight",
    async ({ user, body }) => {
      const staffCunetId = user.email?.split("@")[0] ?? "";
      return successResponse(await RpkmService.checkinFreshmenNight(staffCunetId, body.student_id));
    },
    {
      auth: true,
      body: "Checkin.CheckinBody",
      response: {
        200: tSuccessResponse(CheckinModel.models.Entry.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "UNAUTHORIZED",
          "FORBIDDEN_NOT_STAFF",
          "STUDENT_NOT_FOUND",
          "ALREADY_CHECKED_IN"
        )
      }
    }
  );
