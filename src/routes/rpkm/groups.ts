import { GroupsModel } from "@src/models/groups.model";
import { authMiddleware } from "@src/routes/auth";
import { GroupsService } from "@src/services/groups.service";
import { authSecurity, successResponse, tAppErrors, tSuccessResponse } from "@src/utils";
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
    async ({ studentId, body }) => successResponse(GroupsService.join(studentId, body.joinCode)),
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Groups"],
        summary: "Join a group by join code",
        description:
          "Moves the authenticated freshman into the group behind the join code. Fails when " +
          "the target group is full or confirmed, or when the caller leads a group that still " +
          "has members."
      },
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
  .get("me", async ({ studentId }) => successResponse(GroupsService.getMyGroup(studentId)), {
    auth: true,
    detail: {
      security: authSecurity,
      tags: ["RPKM - Groups"],
      summary: "Get my group",
      description: "The authenticated freshman's group with its members and join code."
    },
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
      detail: {
        security: authSecurity,
        tags: ["RPKM - Groups"],
        summary: "Regenerate my group's join code",
        description:
          "Leader only. Invalidates the old join code and returns a fresh one. Rejected once " +
          "the group is confirmed."
      },
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
    async ({ studentId }) => successResponse(GroupsService.getHousePreferences(studentId)),
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Groups"],
        summary: "Get my group's house preferences",
        description: "Ordered house preference list of the authenticated freshman's group."
      },
      response: {
        200: tSuccessResponse(GroupsModel.models.housePreferencesResponse.Schema()),
        ...tAppErrors("UNAUTHORIZED", "NOT_FOUND")
      }
    }
  )
  .put(
    "me/house-preferences",
    async ({ studentId, body }) =>
      successResponse(GroupsService.setHousePreferences(studentId, body.houseIds)),
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Groups"],
        summary: "Set my group's house preferences",
        description:
          "Leader only. Replaces the group's ordered house preference list. Rejected after " +
          "the house-pick window closes."
      },
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
  .delete("me", async ({ studentId }) => successResponse(GroupsService.leave(studentId)), {
    auth: true,
    detail: {
      security: authSecurity,
      tags: ["RPKM - Groups"],
      summary: "Leave my group",
      description:
        "Leaves the current group and lands the freshman back in a fresh solo group. " +
        "Rejected once the group is confirmed."
    },
    response: {
      200: tSuccessResponse(GroupsModel.models.groupWithMembers.Schema()),
      ...tAppErrors("UNAUTHORIZED", "NOT_FOUND", "ALREADY_CONFIRMED", "INTERNAL_SERVER_ERROR")
    }
  })
  .delete(
    "me/members/:userId",
    async ({ studentId, params }) =>
      successResponse(GroupsService.kickMember(studentId, params.userId)),
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Groups"],
        summary: "Kick a member from my group",
        description:
          "Leader only. Removes the member, who lands in a fresh solo group. Rejected once " +
          "the group is confirmed."
      },
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
