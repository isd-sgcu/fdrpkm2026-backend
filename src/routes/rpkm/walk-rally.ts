import { Elysia, t } from "elysia";

import { authMiddleware } from "@src/routes/auth";
import { WalkRallyModel } from "@src/models/walk-rally.model";
import { WalkRallyService } from "@src/services/walk-rally.service";
import {
  errorResponse,
  successResponse,
  tErrorResponse,
  tSuccessResponse,
  isFreshman
} from "@src/utils";

/**
 * Walk rally routes: workshops/museums/minigame,
 * slot pre-registration & walk-in across 6 shared rounds, staff attendance scan.
 */
export const walkRallyRoute = new Elysia({ prefix: "/walkrally" })
  .use(authMiddleware)
  .use(WalkRallyModel)
  .prefix("model", "WalkRally.")
  .get(
    "/activities/:code/rounds",
    async ({ studentId, status, params }) => {
      if (!isFreshman(studentId)) return status(403, errorResponse("NOT_FRESHMEN"));

      try {
        return successResponse(await WalkRallyService.getActivityRounds(studentId, params.code));
      } catch (err) {
        if (err instanceof WalkRallyService.WalkRallyServiceError) {
          switch (err.code) {
            case "INVALID_ACTIVITY":
              return status(404, errorResponse("INVALID_ACTIVITY"));
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      params: "WalkRally.ActivityCodeParams",
      response: {
        200: tSuccessResponse(WalkRallyModel.models.getActivityRoundsResponse.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN"),
        404: t.Union([tErrorResponse("INVALID_ACTIVITY"), tErrorResponse("NOT_FOUND")])
      }
    }
  )
  .get(
    "/me",
    async ({ studentId, status }) => {
      if (!isFreshman(studentId)) return status(403, errorResponse("NOT_FRESHMEN"));

      try {
        return successResponse(await WalkRallyService.getMe(studentId));
      } catch (err) {
        if (err instanceof WalkRallyService.WalkRallyServiceError) {
          return status(404, errorResponse("NOT_FOUND"));
        }
        throw err;
      }
    },
    {
      auth: true,
      response: {
        200: tSuccessResponse(WalkRallyModel.models.getMeResponse.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN"),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  );
