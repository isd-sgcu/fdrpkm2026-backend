import { GroupsModel } from "@src/models/groups.model";
import { authMiddleware } from "@src/routes/auth";
import { GroupsService } from "@src/services/groups.service";
import { errorResponse, successResponse, tErrorResponse, tSuccessResponse } from "@src/utils";
import { Elysia, t } from "elysia";

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
            default:
              return status(404, errorResponse("NOT_FOUND"));
          }
        }
        throw err;
      }
    },
    {
      auth: true,
      body: "Groups.JoinBody",
      response: {
        200: tSuccessResponse(t.Ref("Groups.GroupWithMembers")),
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("NOT_FRESHMEN"),
        404: t.Union([tErrorResponse("INVALID_JOIN_CODE"), tErrorResponse("NOT_FOUND")]),
        409: t.Union([tErrorResponse("GROUP_FULL"), tErrorResponse("LEADER_HAS_MEMBERS")])
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
        200: tSuccessResponse(t.Ref("Groups.GroupWithMembers")),
        401: tErrorResponse("UNAUTHORIZED"),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  );
// .get("me/house-preferences", ({ auth, status }) => {})
// .put("me/house-preferences", ({ auth, status }) => {})
// .post("me/join-code/regenerate", ({ auth, status }) => {})
// .delete("me", ({ auth, status }) => {})
// .delete("me/members/:userId", ({ auth, status, params }) => {});
// TODO: /v1/rpkm/houses/stats and /v1/rpkm/houses/confirm
