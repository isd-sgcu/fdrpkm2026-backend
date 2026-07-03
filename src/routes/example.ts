import { Elysia, t } from "elysia";
// Import should be prefixed with @src/ to avoid relative path hell
import { errorResponse, tErrorResponse } from "@src/utils";

export const firstdateRoutes = new Elysia({ prefix: "/firstdate" })
  // EXAMPLE only dont forget to remove in prod na
  .decorate("auth", Math.random() > 0.5 ? { user: { userId: "123" } } : { user: null })
  .get(
    "/",
    ({ auth, status }) => {
      if (!auth.user) return status(401, errorResponse("UNAUTHORIZED"));
      if (auth.user.userId !== "123") return status(403, errorResponse("FORBIDDEN"));
    },
    {
      response: {
        200: t.Object({
          name: t.String({
            title: "Name",
            example: ["John Doe", "Jane Doe"]
          })
        }),

        // Error code defined in AppErrorCode enum in src/utils/error.ts
        401: tErrorResponse("UNAUTHORIZED"),
        403: tErrorResponse("FORBIDDEN")
      }
    }
  );
