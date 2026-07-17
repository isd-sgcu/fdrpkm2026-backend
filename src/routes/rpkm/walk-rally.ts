import { Elysia } from "elysia";

import { requestLogger } from "@src/plugins/request-logger";
import { authMiddleware } from "@src/routes/auth";
import { WalkRallyModel } from "@src/models/walk-rally.model";
import { WalkRallyService } from "@src/services/walk-rally.service";
import {
  successResponse,
  tSuccessResponse,
  isFreshman,
  AppError,
  authSecurity,
  tAppErrors
} from "@src/utils";

/**
 * Walk rally routes: workshops/museums/minigame,
 * slot pre-registration & walk-in across 6 shared rounds, staff attendance scan.
 */
// eslint-disable-next-line drizzle/enforce-delete-with-where -- flags the whole chain below for its .delete(...) route method (not a Drizzle query)
export const walkRallyRoute = new Elysia({ prefix: "/walkrally" })
  .use(authMiddleware)
  .use(requestLogger)
  .use(WalkRallyModel)
  .prefix("model", "WalkRally.")
  .get(
    "/activities/:code/rounds",
    async ({ studentId, params }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      return successResponse(WalkRallyService.getActivityRounds(studentId, params.code));
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Walk Rally"],
        summary: "Get an activity's rounds",
        description:
          "Round schedule for one activity (workshop/museum/minigame) with per-round capacity " +
          "and the authenticated freshman's own registration state."
      },
      params: "WalkRally.ActivityCodeParams",
      response: {
        200: tSuccessResponse(WalkRallyModel.models.getActivityRoundsResponse.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN", "INVALID_ACTIVITY", "NOT_FOUND")
      }
    }
  )
  .get(
    "/me",
    async ({ studentId }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");

      return successResponse(WalkRallyService.getMe(studentId));
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Walk Rally"],
        summary: "Get my walk-rally status",
        description:
          "The authenticated freshman's registrations, attendances, and points across all " +
          "walk-rally activities."
      },
      response: {
        200: tSuccessResponse(WalkRallyModel.models.getMeResponse.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN", "NOT_FOUND")
      }
    }
  )
  .post(
    "/registrations",
    async ({ studentId, body, log }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      const result = await WalkRallyService.registerForActivity(studentId, body);
      // Business events for the `walkrally_slot_ops` log-based metric —
      // unregister/change delete or mutate the row, so slot churn is only
      // visible here; the DB gauge shows net occupancy.
      log.info("rpkm.walkrally.registered", { event: "rpkm.walkrally.registered" });
      return successResponse(result);
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Walk Rally"],
        summary: "Pre-register for an activity round",
        description:
          "Books a slot in one of the 6 shared rounds for an activity. Fails on round " +
          "conflicts with other registrations, duplicate activity registration, or after the " +
          "registration window closes."
      },
      body: "WalkRally.RegisterActivityBody",
      response: {
        200: tSuccessResponse(WalkRallyModel.models.registerActivityResponse.Schema()),
        ...tAppErrors(
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "REGISTRATION_CLOSED",
          "INVALID_ACTIVITY",
          "NOT_FOUND",
          "ACTIVITY_ALREADY_REGISTERED",
          "ROUND_CONFLICT"
        )
      }
    }
  )
  .delete(
    "/registrations/:code",
    async ({ studentId, params, log }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      const result = await WalkRallyService.unregisterFromActivity(studentId, params.code);
      log.info("rpkm.walkrally.unregistered", { event: "rpkm.walkrally.unregistered" });
      return successResponse(result);
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Walk Rally"],
        summary: "Cancel my activity registration",
        description: "Frees the booked slot. Rejected after the registration window closes."
      },
      params: "WalkRally.ActivityCodeParams",
      response: {
        200: tSuccessResponse(WalkRallyModel.models.unregisterActivityResponse.Schema()),
        ...tAppErrors(
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "REGISTRATION_CLOSED",
          "INVALID_ACTIVITY",
          "NOT_FOUND"
        )
      }
    }
  )
  .patch(
    "/registrations/:code",
    async ({ studentId, params, body, log }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");

      const result = await WalkRallyService.changeRound(studentId, params.code, body.round);
      log.info("rpkm.walkrally.round_changed", { event: "rpkm.walkrally.round_changed" });
      return successResponse(result);
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Walk Rally"],
        summary: "Change my registered round",
        description:
          "Moves an existing registration to a different round. Same conflict and " +
          "window rules as registering."
      },
      params: "WalkRally.ActivityCodeParams",
      body: "WalkRally.ChangeRoundBody",
      response: {
        200: tSuccessResponse(WalkRallyModel.models.registerActivityResponse.Schema()),
        ...tAppErrors(
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "REGISTRATION_CLOSED",
          "INVALID_ACTIVITY",
          "NOT_FOUND",
          "ROUND_CONFLICT"
        )
      }
    }
  )
  .post(
    "/attendances",
    async ({ studentId, body }) =>
      successResponse(WalkRallyService.checkAttendance(studentId, body)),
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Walk Rally"],
        summary: "Record an attendance scan",
        description:
          "Staff-only (staffRole=walkrally). Marks the scanned freshman as attended for an " +
          "activity and awards points, up to the points cap. Duplicate scans rejected with " +
          "ALREADY_CHECKED_IN."
      },
      body: "WalkRally.CheckAttendanceBody",
      response: {
        200: tSuccessResponse(WalkRallyModel.models.checkAttendanceResponse.Schema()),
        ...tAppErrors(
          "UNAUTHORIZED",
          "FORBIDDEN_NOT_STAFF",
          "STUDENT_NOT_FOUND",
          "INVALID_ACTIVITY",
          "ALREADY_CHECKED_IN",
          "POINTS_CAP_REACHED"
        )
      }
    }
  );
