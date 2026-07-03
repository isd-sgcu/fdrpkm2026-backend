import { Elysia, t } from "elysia";
// Import should be prefixed with @src/ to avoid relative path hell
import { errorResponse, tErrorResponse } from "@src/utils";
import { ExampleModel } from "@src/models/example.model";
import {
  ExampleServiceError,
  getExampleUser,
  upsertExampleUser
} from "@src/services/example.service";

/**
 * Reference implementation for new routes — copy this file's shape when
 * adding a real feature. Only mounted when NODE_ENV=development (see
 * src/routes/index.ts).
 *
 * MVC mapping for this stack:
 *   Model      -> src/services/example.service.ts (data + business rules)
 *                 and src/models/example.model.ts (request/response DTOs)
 *   View       -> the `response` schemas below (they define the JSON shape
 *                 returned to the client — there's no template/HTML view)
 *   Controller -> this file: auth guard -> validate -> call service ->
 *                 translate result/error into an HTTP response
 *
 * Routes should stay thin. If a handler is doing more than a couple of
 * lines of logic, that logic belongs in the service, not here.
 */
export const exampleRoutes = new Elysia({ prefix: "/example" })
  // Fake auth for demo only. Real routes should derive `auth` from an
  // actual auth plugin (see src/routes/auth), never Math.random().
  .decorate("auth", Math.random() > 0.5 ? { user: { userId: "123" } } : { user: null })
  // Apply our model
  .use(ExampleModel)
  .prefix("model", "Example.")
  .get("/", () => ({ project: "example" }))
  // Go to http://localhost:3000/openapi#GET/v1/example/user/{userId} for OpenAPI docs and try it out
  .get(
    "/user/:userId",
    ({ auth, status, params }) => {
      if (!auth.user)
        return status(401, errorResponse("UNAUTHORIZED", { message: "Login required" }));
      if (auth.user.userId !== params.userId)
        // 403 schema below has no context, so no message here either — keep in sync.
        return status(403, errorResponse("FORBIDDEN"));

      try {
        // Controller delegates the actual lookup to the service (Model
        // layer) instead of querying storage itself.
        return getExampleUser(params.userId);
      } catch (err) {
        if (err instanceof ExampleServiceError) return status(404, errorResponse("NOT_FOUND"));
        throw err;
      }
    },
    {
      params: "Example.UserUpdateParams",
      response: {
        200: "Example.UserUpdateBody",
        401: tErrorResponse("UNAUTHORIZED", t.Object({ message: t.String() })),
        403: tErrorResponse("FORBIDDEN"),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  )
  // Go to http://localhost:3000/openapi#POST/v1/example/user/{userId} for OpenAPI docs and try it out
  .post(
    "/user/:userId",
    ({ auth, status, params, body }) => {
      if (!auth.user)
        return status(401, errorResponse("UNAUTHORIZED", { message: "Login required" }));
      if (auth.user.userId !== params.userId)
        return status(403, errorResponse("FORBIDDEN", { message: "Not your account" }));

      // Controller stays thin: validate + auth here, everything else
      // (persistence, business rules) lives in the service.
      return upsertExampleUser({ id: params.userId, ...body });
    },
    // Part below is for OpenAPI docs and type-safe validation.
    {
      // Type-safe params and it will show in OpenAPI Docs
      params: "Example.UserUpdateParams",
      // Type-safe request body, auto api doc and also auto validation
      body: "Example.UserUpdateRequestBody",
      // Type-safe response and OpenAPI Spec generation is Goood
      response: {
        200: "Example.UserUpdateBody", // Type-safe response body, auto api doc and also auto validation

        // Error code defined in AppErrorCode enum in src/utils/error.ts
        401: tErrorResponse("UNAUTHORIZED", t.Object({ message: t.String() })),
        403: tErrorResponse("FORBIDDEN", t.Object({ message: t.String() }))
      }
    }
  );
