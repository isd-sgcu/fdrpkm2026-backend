import { Elysia, t } from "elysia";
import { tErrorResponse } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { FirstDateService } from "@src/services/firstdate.service";

/**
 * FirstDate-only routes. project context = 'firstdate'.
 * e.g. registration, My-QR, staff entry scan (entries, project=firstdate).
 */
export const firstdateRoutes = new Elysia({ prefix: "/fd" })
  // put auth here so the types are inferred correctly in the route handlers below. The auth macro is available as `ctx.auth` in handlers.
  .use(authMiddleware)
  .get("/", ({ user }) => FirstDateService.getFirstDateProfile(user), {
    // add auth: true so it check session and user/session var is available in the handler.
    auth: true,
    response: {
      200: t.Object({
        name: t.String({
          title: "Name",
          example: ["John Doe", "Jane Doe"]
        })
      }),
      401: tErrorResponse("UNAUTHORIZED", t.Object({ message: t.String() }))
    }
  });
