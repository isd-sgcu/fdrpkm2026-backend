import { Elysia } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { requestLogger } from "@src/plugins/request-logger";
import { RpkmService } from "@src/services/rpkm.service";
import { authSecurity, successResponse, tAppErrors, tSuccessResponse } from "@src/utils";
import { CheckinModel } from "@src/models/checkin.model";

// ALREADY_CHECKED_IN carries its typed context (scannedAt/scannedBy) — the
// schema comes from AppErrorContext via tAppErrors, the payload from the
// AppError thrown in checkin.helper.ts.
export const rpkmCheckinRoutes = new Elysia({ prefix: "/checkin" })
  .use(authMiddleware)
  .use(requestLogger)
  .use(CheckinModel)
  .prefix("model", "Checkin.")
  .post(
    "/registration",
    async ({ user, body, log }) => {
      const staffCunetId = user.email?.split("@")[0] ?? "";
      const result = await RpkmService.checkinRegistration(staffCunetId, body.student_id);
      // Business event for the `rpkm_checkins` log-based metric. Logged only
      // after the scan succeeds — ALREADY_CHECKED_IN rejections don't count.
      log.info("rpkm.checkin.success", { event: "rpkm.checkin.success" });
      return successResponse(result);
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
  .get(
    "/registration/status",
    async ({ studentId }) => {
      const result = await RpkmService.getRegistrationCheckinStatus(studentId);
      return successResponse(result);
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Check-in"],
        summary: "Get RPKM check-in status",
        description:
          "Self-serve status lookup for the authenticated freshman — no staff role required. " +
          "404 NOT_FOUND means not checked in yet."
      },
      response: {
        200: tSuccessResponse(CheckinModel.models.CheckinStatus.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FOUND")
      }
    }
  )
  .post(
    "/freshmennight",
    async ({ user, body, log }) => {
      const staffCunetId = user.email?.split("@")[0] ?? "";
      const result = await RpkmService.checkinFreshmenNight(staffCunetId, body.student_id);
      // Business event for the `freshmennight_checkins` log-based metric.
      // Logged only after the scan succeeds.
      log.info("freshmennight.checkin.success", { event: "freshmennight.checkin.success" });
      return successResponse(result);
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
  )
  .get(
    "/freshmennight/status",
    async ({ studentId }) => {
      const result = await RpkmService.getFreshmenNightCheckinStatus(studentId);
      return successResponse(result);
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Check-in"],
        summary: "Get Freshmen Night check-in status",
        description:
          "Self-serve status lookup for the authenticated freshman — no staff role required. " +
          "404 NOT_FOUND means not checked in yet."
      },
      response: {
        200: tSuccessResponse(CheckinModel.models.CheckinStatus.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FOUND")
      }
    }
  );
