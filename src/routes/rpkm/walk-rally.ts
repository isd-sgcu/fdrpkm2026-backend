import { Elysia } from "elysia";

import { authMiddleware } from "@src/routes/auth";
import { WalkRallyModel } from "@src/models/walk-rally.model";
import { WalkRallyService } from "@src/services/walk-rally.service";
import { successResponse, tSuccessResponse, isFreshman, AppError, tAppErrors } from "@src/utils";

/**
 * Walk rally routes: workshops/museums/minigame,
 * slot pre-registration & walk-in across 6 shared rounds, staff attendance scan.
 */
// eslint-disable-next-line drizzle/enforce-delete-with-where -- flags the whole chain below for its .delete(...) route method (not a Drizzle query)
export const walkRallyRoute = new Elysia({ prefix: "/walkrally" })
  .use(authMiddleware)
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
      response: {
        200: tSuccessResponse(WalkRallyModel.models.getMeResponse.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN", "NOT_FOUND")
      }
    }
  )
  .post(
    "/registrations",
    async ({ studentId, body }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      return successResponse(WalkRallyService.registerForActivity(studentId, body));
    },
    {
      auth: true,
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
    async ({ studentId, params }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      return successResponse(WalkRallyService.unregisterFromActivity(studentId, params.code));
    },
    {
      auth: true,
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
    async ({ studentId, params, body }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");

      return successResponse(WalkRallyService.changeRound(studentId, params.code, body.round));
    },
    {
      auth: true,
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
