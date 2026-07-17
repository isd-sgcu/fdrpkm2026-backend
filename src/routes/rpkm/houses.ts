import { Elysia, t } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { HousesModel } from "@src/models/houses.model";
import { HousesService } from "@src/services/houses.service";
import { AppError, authSecurity, isFreshman, tAppErrors, tSuccessResponse } from "@src/utils";

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
    detail: {
      security: authSecurity,
      tags: ["RPKM - Houses"],
      summary: "List all houses",
      description: "All 22 RPKM houses with their capacity metadata."
    },
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
      detail: {
        security: authSecurity,
        tags: ["RPKM - Houses"],
        summary: "Get house demand stats",
        description:
          "Per-house demand statistics (how contested each house is) for freshmen picking " +
          "preferences."
      },
      response: {
        200: t.Array(t.Ref("Houses.HouseStat")),
        ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN")
      }
    }
  )
  .get("/:id", ({ params }) => HousesService.getHouse(params.id), {
    auth: true,
    detail: {
      security: authSecurity,
      tags: ["RPKM - Houses"],
      summary: "Get a house by id"
    },
    params: "Houses.HouseId",
    response: {
      200: "Houses.House",
      ...tAppErrors("VALIDATION", "NOT_FOUND")
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
      detail: {
        security: authSecurity,
        tags: ["RPKM - Houses"],
        summary: "Get my house assignment result",
        description:
          "The house the authenticated freshman's group was assigned to. Returns " +
          "RESULT_NOT_ANNOUNCED before the announcement window opens."
      },
      response: {
        200: tSuccessResponse(HousesModel.models.houseResult.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN", "RESULT_NOT_ANNOUNCED", "NOT_FOUND")
      }
    }
  );
