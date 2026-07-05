import { Elysia, t } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { HousesModel } from "@src/models/houses.model";
import { RpkmService } from "@src/services/rpkm.service";
import { errorResponse, tErrorResponse } from "@src/utils";

export const houseRoute = new Elysia({ prefix: "/houses" })
  .use(authMiddleware)
  .use(HousesModel)
  .prefix("model", "Houses.")
  // Real Drizzle + Elysia integration example (elysiajs.com/integrations/drizzle):
  // `house`/`houseId` schemas come from HousesModel, which builds them from
  // the `houses` Drizzle table via drizzle-typebox — one schema for DB rows,
  // validation, and OpenAPI, instead of a hand-duplicated t.Object.
  .get("/", () => RpkmService.listHouses(), {
    auth: true,
    response: { 200: t.Array(t.Ref("Houses.House")) }
  })
  .get(
    "/:id",
    async ({ status, params }) => {
      try {
        return await RpkmService.getHouse(params.id);
      } catch (err) {
        if (err instanceof RpkmService.RpkmServiceError)
          return status(404, errorResponse("NOT_FOUND"));
        throw err;
      }
    },
    {
      auth: true,
      params: "Houses.HouseId",
      response: {
        200: "Houses.House",
        404: tErrorResponse("NOT_FOUND")
      }
    }
  );
