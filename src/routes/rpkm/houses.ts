import { Elysia, t } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { HousesModel } from "@src/models/houses.model";
import { GroupsService } from "@src/services/groups.service";
import { HousesService } from "@src/services/houses.service";
import { AppError, isFreshman, successResponse, tAppErrors, tSuccessResponse } from "@src/utils";

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
    response: { 200: t.Array(t.Ref("Houses.House")) }
  })
  .get(
    "/stats",
    async ({ studentId }) => {
      if (!isFreshman(studentId)) throw new AppError("NOT_FRESHMEN");
      return HousesService.getHouseStats();
    },
    {
      auth: true,
      response: {
        200: t.Array(t.Ref("Houses.HouseStat")),
        ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN")
      }
    }
  )
  .get("/:id", ({ params }) => HousesService.getHouse(params.id), {
    auth: true,
    params: "Houses.HouseId",
    response: {
      200: "Houses.House",
      ...tAppErrors("NOT_FOUND")
    }
  })
  .get(
    "/result",
    async ({ studentId }) => ({
      success: true as const,
      data: await HousesService.getHouseResult(studentId)
    }),
    {
      auth: true,
      response: {
        200: tSuccessResponse(HousesModel.models.houseResult.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN", "RESULT_NOT_ANNOUNCED", "NOT_FOUND")
      }
    }
  )
  .post(
    "/confirm",
    async ({ studentId }) => successResponse(await GroupsService.confirmGroup(studentId)),
    {
      auth: true,
      response: {
        200: tSuccessResponse(HousesModel.models.confirmResponse.Schema()),
        ...tAppErrors(
          "TOO_MANY_HOUSE_PREFS",
          "HOUSE_PREF_INCOMPLETE",
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "NOT_LEADER",
          "NOT_FOUND",
          "ALREADY_CONFIRMED"
        )
      }
    }
  );
