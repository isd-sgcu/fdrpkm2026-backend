import { Elysia, t } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { HousesModel } from "@src/models/houses.model";
import { GroupsService } from "@src/services/groups.service";
import { RpkmService } from "@src/services/rpkm.service";
import { errorResponse, successResponse, tErrorResponse, tSuccessResponse } from "@src/utils";

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
        200: tSuccessResponse(t.Ref("Houses.ConfirmResponse")),
        400: tErrorResponse("HOUSE_PREF_INCOMPLETE"),
        401: tErrorResponse("UNAUTHORIZED"),
        403: t.Union([tErrorResponse("NOT_FRESHMEN"), tErrorResponse("NOT_LEADER")]),
        404: tErrorResponse("NOT_FOUND"),
        409: tErrorResponse("ALREADY_CONFIRMED")
      }
    }
  );
