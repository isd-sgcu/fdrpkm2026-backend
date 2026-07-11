import { Elysia, t } from "elysia";
import { tErrorResponse } from "@src/utils";
import { authMiddleware } from "@src/routes/auth";
import { FirstDateService } from "@src/services/firstdate.service";
import { fdCheckinRoutes } from "./checkin";

/**
 * FirstDate-only routes. project context = 'firstdate'.
 * e.g. registration, My-QR, staff entry scan (entries, project=firstdate).
 */
export const firstdateRoutes = new Elysia({ prefix: "/fd" })
  .use(authMiddleware)
  .use(fdCheckinRoutes)
  .get("/", ({ user }) => FirstDateService.getFirstDateProfile(user), {
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
