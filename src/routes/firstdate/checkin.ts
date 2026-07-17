import { Elysia } from "elysia";
import { authSecurity, successResponse, tAppErrors } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { requestLogger } from "@src/plugins/request-logger";
import { FirstDateService } from "@src/services/firstdate.service";
import { CheckinModel } from "@src/models/checkin.model";

export const fdCheckinRoutes = new Elysia({ prefix: "/checkin" })
  .use(authMiddleware)
  .use(requestLogger)
  .use(CheckinModel)
  .prefix("model", "Checkin.")
  .post(
    "/registration",
    async ({ body, studentId, log }) => {
      const result = await FirstDateService.checkinFirstDate(studentId, body.student_id);
      // Business event for the `fd_checkins` log-based metric. Logged only
      // after the scan succeeds — ALREADY_CHECKED_IN rejections don't count.
      log.info("fd.checkin.success", { event: "fd.checkin.success" });
      return successResponse(result);
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["FirstDate - Check-in"],
        summary: "Check a freshman in to FirstDate",
        description:
          "Staff-only entry scan (staffRole=firstdate). Records an entry for the scanned " +
          "freshman's student id; rejects a second scan with ALREADY_CHECKED_IN (context " +
          "carries scannedAt/scannedBy)."
      },
      body: "Checkin.CheckinBody",
      response: {
        200: "Checkin.SuccessCheckinResponse",
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
