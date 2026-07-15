import { Elysia } from "elysia";

import { authMiddleware } from "@src/routes/auth";
import { GamesModel } from "@src/models/games.model";
import { GamesService } from "@src/services/games.service";
import {
  AppError,
  authSecurity,
  isFreshman,
  successResponse,
  tAppErrors,
  tSuccessResponse
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
    async ({ studentId, params }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      return successResponse(GamesService.getProgress(studentId, params.gameType));
    },
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Games"],
        summary: "Get my game progress",
        description:
          "Collected vs. total checkpoints for the given game (`jigsaw` or `csr`) for the " +
          "authenticated freshman. Jigsaw: 10 campus points, 20 Jul – 3 Aug. CSR: ~35 points " +
          "around Chula, 20 Jul – 7 Aug."
      },
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
      detail: {
        security: authSecurity,
        tags: ["RPKM - Games"],
        summary: "Collect a game checkpoint",
        description:
          "Records a checkpoint scan for the authenticated freshman. Validates the game is " +
          "open, the checkpoint belongs to the game, the student is inside the geofence, and " +
          "the checkpoint wasn't already collected."
      },
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
