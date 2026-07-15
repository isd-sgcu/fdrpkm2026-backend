import { Elysia } from "elysia";

import { authSecurity, successResponse, tAppErrors, tSuccessResponse } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { RpkmRegistrationModel } from "@src/models/rpkm-registration.model";
import { RpkmService } from "@src/services/rpkm.service";

/**
 * RPKM user routes — the registration flow (project=rpkm). Thin controllers:
 * auth guard (via the `auth: true` macro) → validate (via the model schemas)
 * → call the service. All storage + business rules live in RpkmService (see
 * docs/mvc.md); business failures are AppErrors handled by the global
 * onError (src/app.ts).
 *
 * Kept as its own Elysia instance (not folded into rpkmRoutes) so its model
 * namespace ("RpkmUser.") stays independent of the houses model's ("Rpkm.")
 * — stacking two `.prefix("model", …)` calls on one instance double-prefixes.
 */
export const rpkmUserRoutes = new Elysia({ prefix: "/rpkm/users" })
  .use(authMiddleware)
  .use(RpkmRegistrationModel)
  .prefix("model", "RpkmUser.")
  .post(
    "/registration",
    async ({ user, body }) => successResponse(RpkmService.registerRpkm(user, body)),
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Users"],
        summary: "Register for RPKM",
        description:
          "Creates the RPKM registration for the authenticated freshman (PDPA consent " +
          "recorded) and a solo group. Fails with ALREADY_REGISTERED on a second attempt."
      },
      body: "RpkmUser.RegistrationBody",
      response: {
        200: tSuccessResponse(RpkmRegistrationModel.models.registrationResult.Schema()),
        ...tAppErrors(
          "VALIDATION",
          "UNAUTHORIZED",
          "NOT_FRESHMEN",
          "ALREADY_REGISTERED",
          "INTERNAL_SERVER_ERROR"
        )
      }
    }
  )
  // Any authenticated user may read their own debloated info (no freshman/staff gate).
  .get("/me", async ({ user }) => successResponse(RpkmService.getMe(user)), {
    auth: true,
    detail: {
      security: authSecurity,
      tags: ["RPKM - Users"],
      summary: "Get my RPKM summary",
      description:
        "Lightweight info about the authenticated user for the RPKM context " +
        "(any authenticated user — no freshman/staff gate)."
    },
    response: {
      200: tSuccessResponse(RpkmRegistrationModel.models.meResult.Schema()),
      ...tAppErrors("UNAUTHORIZED", "NOT_FRESHMEN")
    }
  })
  // Detailed registration profile prefill
  .get("/profile", async ({ user }) => successResponse(RpkmService.getProfile(user)), {
    auth: true,
    detail: {
      security: authSecurity,
      tags: ["RPKM - Users"],
      summary: "Get my RPKM profile",
      description: "Detailed registration profile, used to prefill the registration form."
    },
    response: {
      200: tSuccessResponse(RpkmRegistrationModel.models.profileResult.Schema()),
      ...tAppErrors("UNAUTHORIZED")
    }
  })
  .patch(
    "/profile",
    async ({ user, body }) => successResponse(RpkmService.updateProfile(user, body)),
    {
      auth: true,
      detail: {
        security: authSecurity,
        tags: ["RPKM - Users"],
        summary: "Update my RPKM profile",
        description: "Partial update of the registration profile fields."
      },
      body: "RpkmUser.UpdateProfileBody",
      response: {
        200: tSuccessResponse(RpkmRegistrationModel.models.profileResult.Schema()),
        ...tAppErrors("VALIDATION", "UNAUTHORIZED", "NOT_FOUND")
      }
    }
  );
