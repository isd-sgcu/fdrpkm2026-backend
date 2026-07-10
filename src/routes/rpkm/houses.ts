import { Elysia, t } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { HousesModel } from "@src/models/houses.model";
import { GroupsService } from "@src/services/groups.service";
import { HousesService } from "@src/services/houses.service";
import {
  errorResponse,
  successResponse,
  tErrorResponse,
  tSuccessResponse,
  isFreshman
} from "@src/utils";

export const houseRoute = new Elysia({ prefix: "/houses" })
  .use(authMiddleware)
  .use(HousesModel)
  .prefix("model", "Houses.")
  // Real Drizzle + Elysia integration example (elysiajs.com/integrations/drizzle):
  // `house`/`houseId` schemas come from HousesModel, which builds them from
  // the `houses` Drizzle table via drizzle-typebox — one schema for DB rows,
  // validation, and OpenAPI, instead of a hand-duplicated t.Object.
  .get("/", () => HousesService.listHouses(), {
    auth: true,
    response: { 200: t.Array(HousesModel.models.house.Schema()) }
  })
  .get(
    "/stats",
    async ({ studentId, status }) => {
      if (!isFreshman(studentId)) return status(403, errorResponse("NOT_FRESHMEN"));
      return HousesService.getHouseStats();
    },
    {
      auth: true,
      response: {
        200: t.Array(HousesModel.models.houseStat.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN")
      }
    }
  )
  .get(
    "/:id",
    async ({ status, params }) => {
      try {
        return await HousesService.getHouse(params.id);
      } catch (err) {
        if (err instanceof HousesService.HousesServiceError)
          return status(404, errorResponse("NOT_FOUND"));
        throw err;
      }
    },
    {
      auth: true,
      params: HousesModel.models.houseId.Schema(),
      response: {
        200: HousesModel.models.house.Schema(),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  )
  .get(
    "/result",
    async ({ studentId, status }) => {
      try {
        return { success: true as const, data: await HousesService.getHouseResult(studentId) };
      } catch (err) {
        if (err instanceof HousesService.HousesServiceError) {
          switch (err.code) {
            case "NOT_FRESHMEN":
              return status(403, errorResponse("NOT_FRESHMEN"));
            case "RESULT_NOT_ANNOUNCED":
              return status(403, errorResponse("RESULT_NOT_ANNOUNCED"));
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      response: {
        200: tSuccessResponse(HousesModel.models.houseResult.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: t.Union([tErrorResponse("NOT_FRESHMEN"), tErrorResponse("RESULT_NOT_ANNOUNCED")]),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  )
  .post(
    "/confirm",
    async ({ studentId, status }) => {
      try {
        return successResponse(await GroupsService.confirmGroup(studentId));
      } catch (err) {
        if (err instanceof GroupsService.GroupsServiceError) {
          switch (err.code) {
            case "NOT_FRESHMEN":
              return status(403, errorResponse("NOT_FRESHMEN"));
            case "NOT_LEADER":
              return status(403, errorResponse("NOT_LEADER"));
            case "ALREADY_CONFIRMED":
              return status(409, errorResponse("ALREADY_CONFIRMED"));
            case "HOUSE_PREF_INCOMPLETE":
              return status(400, errorResponse("HOUSE_PREF_INCOMPLETE"));
            case "TOO_MANY_HOUSE_PREFS":
              return status(400, errorResponse("TOO_MANY_HOUSE_PREFS"));
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      response: {
        200: tSuccessResponse(HousesModel.models.confirmResponse.Schema()),
        400: t.Union([
          tErrorResponse("TOO_MANY_HOUSE_PREFS"),
          tErrorResponse("HOUSE_PREF_INCOMPLETE")
        ]),
        401: tErrorResponse("UNAUTHORIZED"),
        403: t.Union([tErrorResponse("NOT_FRESHMEN"), tErrorResponse("NOT_LEADER")]),
        404: tErrorResponse("NOT_FOUND"),
        409: tErrorResponse("ALREADY_CONFIRMED")
      }
    }
  );
