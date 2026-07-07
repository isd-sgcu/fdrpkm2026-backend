import { Elysia, t } from "elysia";
import { authMiddleware } from "@src/routes/auth";
import { HousesModel } from "@src/models/houses.model";
import { RpkmService } from "@src/services/rpkm.service";
import { errorResponse, tErrorResponse } from "@src/utils";
import { CheckinError } from "@src/services/checkin.helper";

/**
 * RPKM-only routes. project context = 'rpkm'.
 * e.g. registration, houses + groups, jigsaw/CSR scans, static activities.
 */
export const rpkmRoutes = new Elysia({ prefix: "/rpkm" })
  .use(authMiddleware)
  .use(HousesModel)
  .prefix("model", "Rpkm.")
  .get("/", () => ({ project: "rpkm" }), { auth: true })
  // Real Drizzle + Elysia integration example (elysiajs.com/integrations/drizzle):
  // `house`/`houseId` schemas come from HousesModel, which builds them from
  // the `houses` Drizzle table via drizzle-typebox — one schema for DB rows,
  // validation, and OpenAPI, instead of a hand-duplicated t.Object.
  .get("/houses", () => RpkmService.listHouses(), {
    auth: true,
    response: { 200: t.Array(t.Ref("Rpkm.House")) }
  })
  .get(
    "/houses/:id",
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
      params: "Rpkm.HouseId",
      response: {
        200: "Rpkm.House",
        404: tErrorResponse("NOT_FOUND")
      }
    }
  )
  .post(
    "/checkin/registration",
    async ({ user, body, status }) => {
      try {
        const staffCunetId = user.email?.split("@")[0] ?? "";
        const entry = await RpkmService.checkinRegistration(staffCunetId, body.student_id);
        return { success: true as const, data: entry };
      } catch (err) {
        if (err instanceof RpkmService.RpkmServiceError || err instanceof CheckinError) {
          switch (err.code) {
            case "STUDENT_NOT_FOUND":
              return status(404, errorResponse("STUDENT_NOT_FOUND"));
            case "FORBIDDEN_NOT_STAFF":
              return status(403, errorResponse("FORBIDDEN_NOT_STAFF"));
            case "ALREADY_CHECKED_IN":
              return status(409, errorResponse("ALREADY_CHECKED_IN"));
            default:
              throw err;
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: t.Object({ student_id: t.String({ minLength: 1 }) }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ id: t.String() })
        }),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("FORBIDDEN_NOT_STAFF"),
        404: tErrorResponse("STUDENT_NOT_FOUND"),
        409: tErrorResponse("ALREADY_CHECKED_IN")
      }
    }
  )
  .post(
    "/checkin/freshmennight",
    async ({ user, body, status }) => {
      try {
        const staffCunetId = user.email?.split("@")[0] ?? "";
        const entry = await RpkmService.checkinFreshmenNight(staffCunetId, body.student_id);
        return { success: true as const, data: entry };
      } catch (err) {
        if (err instanceof RpkmService.RpkmServiceError || err instanceof CheckinError) {
          switch (err.code) {
            case "STUDENT_NOT_FOUND":
              return status(404, errorResponse("STUDENT_NOT_FOUND"));
            case "FORBIDDEN_NOT_STAFF":
              return status(403, errorResponse("FORBIDDEN_NOT_STAFF"));
            case "ALREADY_CHECKED_IN":
              return status(409, errorResponse("ALREADY_CHECKED_IN"));
            default:
              throw err;
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: t.Object({ student_id: t.String({ minLength: 1 }) }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ id: t.String() })
        }),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("FORBIDDEN_NOT_STAFF"),
        404: tErrorResponse("STUDENT_NOT_FOUND"),
        409: tErrorResponse("ALREADY_CHECKED_IN")
      }
    }
  );
