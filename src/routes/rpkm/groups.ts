import { GroupsModel } from "@src/models/groups.model";
import { authMiddleware } from "@src/routes/auth";
import { GroupsService } from "@src/services/groups.service";
import { successResponse, tAppErrors, tSuccessResponse } from "@src/utils";
import { Elysia } from "elysia";

// Thin controllers: services throw AppError on business failures; the global
// onError handler (src/app.ts) maps them to the standard error envelope. The
// tAppErrors(...) spread declares which codes each endpoint can produce.
// eslint-disable-next-line drizzle/enforce-delete-with-where -- flags the whole chain below for its .delete(...) route method (not a Drizzle query)
export const groupRoute = new Elysia({ prefix: "/groups" })
  .use(authMiddleware)
  .use(GroupsModel)
  .prefix("model", "Groups.")
  .post(
    "join",
    async ({ studentId, body }) =>
      successResponse(await GroupsService.join(studentId, body.joinCode)),
    {
      auth: true,
      body: "Groups.JoinBody",
      response: {
        200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "NOT_FOUND",
          "INVALID_JOIN_CODE",
          "ALREADY_CONFIRMED",
          "LEADER_HAS_MEMBERS",
          "GROUP_FULL"
        )
      }
    }
  )
  .get("me", async ({ studentId }) => successResponse(await GroupsService.getMyGroup(studentId)), {
    auth: true,
    response: {
      200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
      ...tAppErrors("UNAUTHORIZED", "NOT_FOUND")
    }
  })
  .post(
    "me/join-code/regenerate",
    async ({ studentId }) =>
      successResponse({ joinCode: await GroupsService.regenerateJoinCode(studentId) }),
    {
      auth: true,
      response: {
        200: tSuccessResponse(GroupsModel.models.joinCodeResponse.Schema()),
        ...tAppErrors(
          "UNAUTHORIZED",
          "NOT_LEADER",
          "NOT_FOUND",
          "ALREADY_CONFIRMED",
          "INTERNAL_SERVER_ERROR"
        )
      }
    }
  )
  .get(
    "me/house-preferences",
    async ({ studentId }) => successResponse(await GroupsService.getHousePreferences(studentId)),
    {
      auth: true,
      response: {
        200: tSuccessResponse(GroupsModel.models.housePreferencesResponse.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FOUND")
      }
    }
  )
  .put(
    "me/house-preferences",
    async ({ studentId, body }) =>
      successResponse(await GroupsService.setHousePreferences(studentId, body.houseIds)),
    {
      auth: true,
      body: "Groups.HousePreferencesBody",
      response: {
        200: tSuccessResponse(GroupsModel.models.housePreferencesResponse.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "BAD_REQUEST",
          "UNAUTHORIZED",
          "NOT_LEADER",
          "NOT_FOUND",
          "HOUSE_PICK_CLOSED"
        )
      }
    }
  )
  .delete("me", async ({ studentId }) => successResponse(await GroupsService.leave(studentId)), {
    auth: true,
    response: {
      200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
      ...tAppErrors("UNAUTHORIZED", "NOT_FOUND", "ALREADY_CONFIRMED", "INTERNAL_SERVER_ERROR")
    }
  })
  .delete(
    "me/members/:userId",
    async ({ studentId, params }) =>
      successResponse(await GroupsService.kickMember(studentId, params.userId)),
    {
      auth: true,
      params: "Groups.MemberParams",
      response: {
        200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "BAD_REQUEST",
          "UNAUTHORIZED",
          "NOT_LEADER",
          "NOT_FOUND",
          "ALREADY_CONFIRMED",
          "INTERNAL_SERVER_ERROR"
        )
      }
    }
  );
