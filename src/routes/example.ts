import { Elysia, t } from "elysia";
// Import should be prefixed with @src/ to avoid relative path hell
import { AppError, tAppErrors } from "@src/utils";
import { ExampleModel } from "@src/models/example.model";
import { ExampleService } from "@src/services/example.service";
import { authMiddleware } from "@src/routes/auth";

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
 *   Controller -> this file: auth guard -> validate -> call service
 *
 * Routes should stay thin. Business failures are signalled by throwing
 * `AppError(code)` (from guards here or from the service) — the global
 * onError handler in src/app.ts maps the code to its HTTP status and the
 * standard `{ success: false, error: { code, context? } }` envelope. The
 * `...tAppErrors(codes)` spread declares those codes in the response schema
 * (for OpenAPI docs), deriving each status from AppErrorCode.
 */
// eslint-disable-next-line drizzle/enforce-delete-with-where -- flags the whole chain below for its .delete(...) route method (not a Drizzle query)
export const exampleRoutes = new Elysia({ prefix: "/example" })
  // Fake auth for demo only. Real routes should derive `auth` from an
  // actual auth plugin (see src/routes/auth), never Math.random().
  .decorate("auth", Math.random() > 0.5 ? { user: { userId: "123" } } : { user: null })
  // Apply our model
  .use(authMiddleware)
  .use(ExampleModel)
  .prefix("model", "Example.")
  .get("/", () => ({ project: "example" }))
  // Go to http://localhost:3000/openapi#GET/v1/example/user/{userId} for OpenAPI docs and try it out
  .get(
    "/user/:userId",
    ({ auth, params }) => {
      if (!auth.user) throw new AppError("UNAUTHORIZED");
      if (auth.user.userId !== params.userId) throw new AppError("FORBIDDEN");

      // Controller delegates the actual lookup to the service (Model layer)
      // instead of querying storage itself. If the user doesn't exist the
      // service throws AppError("NOT_FOUND") — no try/catch needed here.
      return ExampleService.getExampleUser(params.userId);
    },
    {
      params: "Example.UserUpdateParams",
      response: {
        200: "Example.UserUpdateBody",
        // Error codes defined in AppErrorCode enum in src/utils/error.ts;
        // statuses (401/403/404) derive from the codes automatically.
        ...tAppErrors("UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND")
      }
    }
  )
  // Go to http://localhost:3000/openapi#POST/v1/example/user/{userId} for OpenAPI docs and try it out
  .post(
    "/user/:userId",
    ({ auth, params, body, studentId }) => {
      if (!auth.user) throw new AppError("UNAUTHORIZED");
      if (auth.user.userId !== params.userId) throw new AppError("FORBIDDEN");
      // Non-registered codes may attach free-form context; it's returned in
      // the envelope's `error.context`.
      if (!studentId.startsWith("69"))
        throw new AppError("NOT_FRESHMEN", {
          message: "Only freshmen can update their information"
        });

      // Controller stays thin: validate + auth here, everything else
      // (persistence, business rules) lives in the service.
      return ExampleService.upsertExampleUser({ id: params.userId, ...body });
    },
    // Part below is for OpenAPI docs and type-safe validation.
    {
      auth: true,
      // Type-safe params and it will show in OpenAPI Docs
      params: "Example.UserUpdateParams",
      // Type-safe request body, auto api doc and also auto validation
      body: "Example.UserUpdateRequestBody",
      // Type-safe response and OpenAPI Spec generation is Goood
      response: {
        200: "Example.UserUpdateBody", // Type-safe response body, auto api doc and also auto validation
        // NOT_FRESHMEN and FORBIDDEN share 403 — tAppErrors unions them.
        ...tAppErrors("UNAUTHORIZED", "FORBIDDEN", "NOT_FRESHMEN")
      }
    }
  )
  // Go to http://localhost:3000/openapi#DELETE/v1/example/user/{userId} for OpenAPI docs and try it out
  .delete(
    "/user/:userId",
    ({ auth, status, params }) => {
      if (!auth.user) throw new AppError("UNAUTHORIZED");
      if (auth.user.userId !== params.userId) throw new AppError("FORBIDDEN");

      // Throws AppError("NOT_FOUND") when there's nothing to delete.
      ExampleService.deleteExampleUser(params.userId);
      return status(204, undefined);
    },
    {
      params: "Example.UserUpdateParams",
      response: {
        204: t.Void(),
        ...tAppErrors("UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND")
      }
    }
  )
  // Example protected route with auth macro. The auth macro is available as `ctx.auth` in handlers.
  .post(
    "/protected",
    ({ auth }) => {
      if (!auth.user) throw new AppError("UNAUTHORIZED");

      return { message: `Hello ${auth.user.userId}, you are authorized!` };
    },
    {
      // ADD THIS TO ACTIVATE AUTH MACRO IN HANDLER.
      response: {
        200: t.Object({ message: t.String() }),
        ...tAppErrors("UNAUTHORIZED")
      }
    }
  );
