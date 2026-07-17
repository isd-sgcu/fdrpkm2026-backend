import { Elysia } from "elysia";

import { isAllowedOrigin } from "@src/config";
import { AvatarModel } from "@src/models/avatar.model";
import { requestLogger } from "@src/plugins/request-logger";
import { authMiddleware } from "@src/routes/auth";
import { AvatarService } from "@src/services/avatar.service";
import { AppError, authSecurity, successResponse, tAppErrors, tSuccessResponse } from "@src/utils";

/**
 * Shared (firstdate + rpkm) avatar upload for the authenticated user. Thin
 * controller per docs/mvc.md + docs/upload-guide.md: the model validates the
 * multipart file, AvatarService recompresses and stores it.
 */
export const avatarRoutes = new Elysia({ prefix: "/me" })
  .use(authMiddleware)
  .use(requestLogger)
  .use(AvatarModel)
  .prefix("model", "Avatar.")
  .post(
    "/avatar",
    async ({ user, body, log }) => {
      const result = await AvatarService.updateAvatar(user.id, body.file);
      // Re-uploads overwrite user.image, so upload activity is only countable
      // here (log-based metric), not from the DB.
      log.info("avatar.uploaded", { event: "avatar.uploaded" });
      return successResponse(result);
    },
    {
      auth: true,
      // CSRF defense: reject credentialed cross-site POSTs. Browsers always send
      // an Origin on cross-origin requests; same-origin and non-browser (bearer)
      // clients that omit it are unaffected. better-auth's own origin check does
      // not cover this custom route, so it's enforced here explicitly.
      beforeHandle({ request }) {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) {
          throw new AppError("FORBIDDEN");
        }
      },
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
        ...tAppErrors(
          "VALIDATION",
          "UNAUTHORIZED",
          "FORBIDDEN",
          "BAD_REQUEST",
          "INTERNAL_SERVER_ERROR"
        )
      }
    }
  );
