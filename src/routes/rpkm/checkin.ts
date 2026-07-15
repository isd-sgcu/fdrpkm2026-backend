import { Elysia } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { RpkmService } from "@src/services/rpkm.service";
import { authSecurity, successResponse, tAppErrors, tSuccessResponse } from "@src/utils";
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
      return successResponse(RpkmService.checkinRegistration(staffCunetId, body.student_id));
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Check-in"],
        summary: "Check a freshman in to RPKM",
        description:
          "Staff-only entry scan for the RPKM event (staffRole=rpkm). Rejects a second scan " +
          "with ALREADY_CHECKED_IN (context carries scannedAt/scannedBy)."
      },
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
      return successResponse(RpkmService.checkinFreshmenNight(staffCunetId, body.student_id));
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Check-in"],
        summary: "Check a freshman in to Freshmen Night",
        description:
          "Staff-only entry scan for Freshmen Night (staffRole=freshmennight). Rejects a " +
          "second scan with ALREADY_CHECKED_IN (context carries scannedAt/scannedBy)."
      },
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
