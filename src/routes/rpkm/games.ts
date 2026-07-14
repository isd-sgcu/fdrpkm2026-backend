import { Elysia } from "elysia";

import { authMiddleware } from "@src/routes/auth";
import { GamesModel } from "@src/models/games.model";
import { GamesService } from "@src/services/games.service";
import { AppError, isFreshman, successResponse, tAppErrors, tSuccessResponse } from "@src/utils";

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
    async ({ studentId, params }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      return successResponse(await GamesService.getProgress(studentId, params.gameType));
    },
    {
      auth: true,
      params: "Games.GameTypeParams",
      response: {
        200: tSuccessResponse(GamesModel.models.progressResponse.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "INVALID_GAME_TYPE",
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "NOT_FOUND"
        )
      }
    }
  )
  .post(
    "/:gameType/collect",
    async ({ studentId, params, body }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      return successResponse(
        await GamesService.collectCheckpoint(studentId, params.gameType, body)
      );
    },
    {
      auth: true,
      params: "Games.GameTypeParams",
      body: "Games.CollectCheckpointBody",
      response: {
        200: tSuccessResponse(GamesModel.models.collectCheckpointResponse.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "INVALID_GAME_TYPE",
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "OUT_OF_GEOFENCE",
          "GAME_CLOSED",
          "INVALID_CHECKPOINT",
          "NOT_FOUND",
          "ALREADY_COLLECTED"
        )
      }
    }
  );
