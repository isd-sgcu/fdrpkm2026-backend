import { GroupsModel } from "@src/models/groups.model";
import { authMiddleware } from "@src/routes/auth";
import { GroupsService } from "@src/services/groups.service";
import { errorResponse, successResponse, tErrorResponse, tSuccessResponse } from "@src/utils";
import { Elysia, t } from "elysia";

// eslint-disable-next-line drizzle/enforce-delete-with-where -- flags the whole chain below for its .delete(...) route method (not a Drizzle query)
export const groupRoute = new Elysia({ prefix: "/groups" })
  .use(authMiddleware)
  .use(GroupsModel)
  .prefix("model", "Groups.")
  .post(
    "join",
    async ({ studentId, status, body }) => {
      try {
        return successResponse(await GroupsService.join(studentId, body.joinCode));
      } catch (err) {
        if (err instanceof GroupsService.GroupsServiceError) {
          switch (err.code) {
            case "NOT_FRESHMEN":
              return status(403, errorResponse("NOT_FRESHMEN"));
            case "INVALID_JOIN_CODE":
              return status(404, errorResponse("INVALID_JOIN_CODE"));
            case "GROUP_FULL":
              return status(409, errorResponse("GROUP_FULL"));
            case "LEADER_HAS_MEMBERS":
              return status(409, errorResponse("LEADER_HAS_MEMBERS"));
            case "ALREADY_CONFIRMED":
              return status(409, errorResponse("ALREADY_CONFIRMED"));
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: GroupsModel.models.joinBody.Schema(),
      response: {
        200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN"),
        404: t.Union([tErrorResponse("INVALID_JOIN_CODE"), tErrorResponse("NOT_FOUND")]),
        409: t.Union([
          tErrorResponse("GROUP_FULL"),
          tErrorResponse("LEADER_HAS_MEMBERS"),
          tErrorResponse("ALREADY_CONFIRMED")
        ])
      }
    }
  )
  .get(
    "me",
    async ({ studentId, status }) => {
      try {
        return successResponse(await GroupsService.getMyGroup(studentId));
      } catch (err) {
        if (err instanceof GroupsService.GroupsServiceError)
          return status(404, errorResponse("NOT_FOUND"));
        throw err;
      }
    },
    {
      auth: true,
      response: {
        200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  )
  .post(
    "me/join-code/regenerate",
    async ({ studentId, status }) => {
      try {
        return successResponse({ joinCode: await GroupsService.regenerateJoinCode(studentId) });
      } catch (err) {
        if (err instanceof GroupsService.GroupsServiceError) {
          switch (err.code) {
            case "NOT_LEADER":
              return status(403, errorResponse("NOT_LEADER"));
            case "ALREADY_CONFIRMED":
              return status(409, errorResponse("ALREADY_CONFIRMED"));
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
        200: tSuccessResponse(GroupsModel.models.joinCodeResponse.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_LEADER"),
        404: tErrorResponse("NOT_FOUND"),
        409: tErrorResponse("ALREADY_CONFIRMED")
      }
    }
  )
  .get(
    "me/house-preferences",
    async ({ studentId, status }) => {
      try {
        return successResponse(await GroupsService.getHousePreferences(studentId));
      } catch (err) {
        if (err instanceof GroupsService.GroupsServiceError)
          return status(404, errorResponse("NOT_FOUND"));
        throw err;
      }
    },
    {
      auth: true,
      response: {
        200: tSuccessResponse(GroupsModel.models.housePreferencesResponse.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  )
  .put(
    "me/house-preferences",
    async ({ studentId, status, body }) => {
      try {
        return successResponse(await GroupsService.setHousePreferences(studentId, body.houseIds));
      } catch (err) {
        if (err instanceof GroupsService.GroupsServiceError) {
          switch (err.code) {
            case "NOT_LEADER":
              return status(403, errorResponse("NOT_LEADER"));
            case "BAD_REQUEST":
              return status(400, errorResponse("BAD_REQUEST"));
            case "HOUSE_PICK_CLOSED":
              return status(409, errorResponse("HOUSE_PICK_CLOSED"));
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: GroupsModel.models.housePreferencesBody.Schema(),
      response: {
        200: tSuccessResponse(GroupsModel.models.housePreferencesResponse.Schema()),
        400: tErrorResponse("BAD_REQUEST"),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_LEADER"),
        404: tErrorResponse("NOT_FOUND"),
        409: tErrorResponse("HOUSE_PICK_CLOSED")
      }
    }
  )
  .delete(
    "me",
    async ({ studentId, status }) => {
      try {
        return successResponse(await GroupsService.leave(studentId));
      } catch (err) {
        if (err instanceof GroupsService.GroupsServiceError) {
          switch (err.code) {
            case "ALREADY_CONFIRMED":
              return status(409, errorResponse("ALREADY_CONFIRMED"));
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
        200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
        401: tErrorResponse("UNAUTHORIZED"),
        404: tErrorResponse("NOT_FOUND"),
        409: tErrorResponse("ALREADY_CONFIRMED")
      }
    }
  )
  .delete(
    "me/members/:userId",
    async ({ studentId, status, params }) => {
      try {
        return successResponse(await GroupsService.kickMember(studentId, params.userId));
      } catch (err) {
        if (err instanceof GroupsService.GroupsServiceError) {
          switch (err.code) {
            case "NOT_LEADER":
              return status(403, errorResponse("NOT_LEADER"));
            case "BAD_REQUEST":
              return status(400, errorResponse("BAD_REQUEST"));
            case "ALREADY_CONFIRMED":
              return status(409, errorResponse("ALREADY_CONFIRMED"));
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      params: GroupsModel.models.memberParams.Schema(),
      response: {
        200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
        400: tErrorResponse("BAD_REQUEST"),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_LEADER"),
        404: tErrorResponse("NOT_FOUND"),
        409: tErrorResponse("ALREADY_CONFIRMED")
      }
    }
  );
