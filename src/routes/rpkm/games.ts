import { Elysia, t } from "elysia";

import { authMiddleware } from "@src/routes/auth";
import { GamesModel } from "@src/models/games.model";
import { GamesService } from "@src/services/games.service";
import {
  errorResponse,
  successResponse,
  tErrorResponse,
  tSuccessResponse,
  isFreshman
} from "@src/utils";

/**
 * RPKM game routes - only for jigsaw and csr except walk rally
 * Jigsaw (10 campus points, 20 Jul - 3 Aug)
 * CSR (~35 points around Chula, 20 Jul - 7 Aug)
 */
export const gameRoute = new Elysia({ prefix: "/game" })
  .use(authMiddleware)
  .use(GamesModel)
  .prefix("model", "Games.")
  .get(
    "/:gameType/progress",
    async ({ studentId, status, params }) => {
      if (!isFreshman(studentId)) return status(403, errorResponse("NOT_FRESHMEN"));

      try {
        return successResponse(await GamesService.getProgress(studentId, params.gameType));
      } catch (err) {
        if (err instanceof GamesService.GamesServiceError) {
          switch (err.code) {
            case "INVALID_GAME_TYPE":
              return status(400, errorResponse("INVALID_GAME_TYPE"));
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      params: GamesModel.models.gameTypeParams.Schema(),
      response: {
        200: tSuccessResponse(GamesModel.models.progressResponse.Schema()),
        400: tErrorResponse("INVALID_GAME_TYPE"),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN"),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  )
  .post(
    "/:gameType/collect",
    async ({ studentId, status, params, body }) => {
      if (!isFreshman(studentId)) return status(403, errorResponse("NOT_FRESHMEN"));

      try {
        return successResponse(
          await GamesService.collectCheckpoint(studentId, params.gameType, body)
        );
      } catch (err) {
        if (err instanceof GamesService.GamesServiceError) {
          switch (err.code) {
            case "INVALID_GAME_TYPE":
              return status(400, errorResponse("INVALID_GAME_TYPE"));
            case "INVALID_CHECKPOINT":
              return status(404, errorResponse("INVALID_CHECKPOINT"));
            case "OUT_OF_GEOFENCE":
              return status(403, errorResponse("OUT_OF_GEOFENCE"));
            case "GAME_CLOSED":
              return status(403, errorResponse("GAME_CLOSED"));
            case "ALREADY_COLLECTED":
              return status(409, errorResponse("ALREADY_COLLECTED"));
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      params: GamesModel.models.gameTypeParams.Schema(),
      body: GamesModel.models.collectCheckpointBody.Schema(),
      response: {
        200: tSuccessResponse(GamesModel.models.collectCheckpointResponse.Schema()),
        400: tErrorResponse("INVALID_GAME_TYPE"),
        401: tErrorResponse("UNAUTHORIZED"),
        403: t.Union([
          tErrorResponse("NOT_FRESHMEN"),
          tErrorResponse("OUT_OF_GEOFENCE"),
          tErrorResponse("GAME_CLOSED")
        ]),
        404: t.Union([tErrorResponse("INVALID_CHECKPOINT"), tErrorResponse("NOT_FOUND")]),
        409: tErrorResponse("ALREADY_COLLECTED"),
        422: tErrorResponse("VALIDATION", t.Object({ message: t.String() }))
      }
    }
  );
