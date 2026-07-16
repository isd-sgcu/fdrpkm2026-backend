import { Elysia } from "elysia";

import { AvatarModel } from "@src/models/avatar.model";
import { authMiddleware } from "@src/routes/auth";
import { AvatarService } from "@src/services/avatar.service";
import { authSecurity, successResponse, tAppErrors, tSuccessResponse } from "@src/utils";

/**
 * Shared (firstdate + rpkm) avatar upload for the authenticated user. Thin
 * controller per docs/mvc.md + docs/upload-guide.md: the model validates the
 * multipart file, AvatarService recompresses and stores it.
 */
export const avatarRoutes = new Elysia({ prefix: "/me" })
  .use(authMiddleware)
  .use(AvatarModel)
  .prefix("model", "Avatar.")
  .post(
    "/avatar",
    async ({ user, body }) => successResponse(AvatarService.updateAvatar(user.id, body.file)),
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["Users"],
        summary: "Upload my avatar",
        description:
          "Accepts a jpeg/png/webp up to 15MB, recompresses it to a 512×512 webp, " +
          "stores it in object storage, and updates the user's image URL."
      },
      body: "Avatar.UploadBody",
      response: {
        200: tSuccessResponse(AvatarModel.models.uploadResult.Schema()),
        ...tAppErrors("VALIDATION", "UNAUTHORIZED", "BAD_REQUEST", "INTERNAL_SERVER_ERROR")
      }
    }
  );
