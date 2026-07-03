import { Elysia, t } from "elysia";
import { errorResponse, tErrorResponse } from "@src/utils";

/**
 * FirstDate-only routes. project context = 'firstdate'.
 * e.g. registration, My-QR, staff entry scan (fd_entries).
 */
export const firstdateRoutes = new Elysia({ prefix: "/firstdate" })
  // EXAMPLE only dont forget to remove in prod na
  .decorate("auth", Math.random() > 0.5 ? { userId: "123" } : null)
  .get(
    "/",
    ({ auth, status }) => {
      if (!auth)
        return status(
          401,
          errorResponse("UNAUTHORIZED", {
            message: "You are not authorized to access this resource."
          })
        );

      return { name: "John Doe" };
    },
    {
      response: {
        200: t.Object({
          name: t.String({
            title: "Name",
            example: ["John Doe", "Jane Doe"]
          })
        }),
        401: tErrorResponse("UNAUTHORIZED", t.Object({ message: t.String() }))
      }
    }
  );
