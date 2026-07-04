# MVC in this Elysia stack

Elysia has no built-in MVC — this is a convention layered on top of it. Layer
mapping (see the header comment in `src/routes/example.ts`, the reference
implementation):

| Layer           | File(s)                               | Job                                                                                                                                        |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Model**       | `src/services/<feature>.service.ts`   | Data access + business rules. Owns storage (Drizzle/Postgres, or an in-memory store for a demo). Never touches HTTP.                       |
| **Model (DTO)** | `src/models/<feature>.model.ts`       | Request/response shapes via Elysia's `.model({...})` — `t.Object`, `t.Ref`, etc. Pure schema, no logic.                                    |
| **View**        | the `response:` schemas on each route | This is a JSON API — no templates. The "view" is just the declared response shape, which doubles as the OpenAPI doc and runtime validator. |
| **Controller**  | `src/routes/<feature>/index.ts`       | Auth guard → validate → call service → map result/error to an HTTP response. Nothing else.                                                 |

## Rules

1. **Routes stay thin.** If a handler body is more than a couple of lines of
   real logic, that logic belongs in the service. A controller's job is
   wiring, not business rules.
2. **Routes never touch storage directly.** No `db.query...` or `Map.get...`
   inside `src/routes/*` — only inside `src/services/*.service.ts`.
3. **Models are schema-only.** `src/models/*.model.ts` holds `t.Object`/`t.Ref`
   definitions for validation + OpenAPI docs. No business rules, no I/O.
4. **Namespace models where they're consumed, not where they're defined.**
   Register raw model fields in `<feature>.model.ts` with no self-prefix;
   the consuming route applies its own namespace via
   `.use(FeatureModel).prefix("model", "Feature.")`. See the fix below for
   why double-prefixing breaks.
5. **Imports use the `@src/` alias**, not relative paths (`../../foo`) —
   avoids relative-path hell across `routes/services/models/utils`.
6. **Auth guard first.** `.use(authMiddleware)` + `{ auth: true }` (macro) or
   a manual `if (!auth.user) return status(401, ...)` check, before any
   service call.
7. **Errors are typed, not thrown-and-forgotten.** Services throw a domain
   error class (e.g. `ExampleServiceError` with an `AppErrorCode`); the
   controller catches it and maps `code` → HTTP status. Keeps HTTP concerns
   out of the service layer.
8. **Services export one namespace object, not loose functions.** Each
   `<feature>.service.ts` keeps its functions/error class module-private and
   exports a single `const FeatureService = { fn1, fn2, FeatureServiceError }`.
   Routes import `{ FeatureService }` and call `FeatureService.fn1(...)` —
   one name per feature at the call site instead of a growing named-import
   list, and it mirrors how `ExampleModel`/`FirstDateService`/`RpkmService`
   are all referenced.

## Reference example

`src/models/example.model.ts` + `src/services/example.service.ts` +
`src/routes/example.ts` (mounted only when `NODE_ENV=development`, see
`src/routes/index.ts`) — copy this file's shape when adding a real feature.

```ts
// Controller (src/routes/example.ts)
.get("/user/:userId", ({ auth, status, params }) => {
  if (!auth.user) return status(401, errorResponse("UNAUTHORIZED", { message: "Login required" }));
  if (auth.user.userId !== params.userId) return status(403, errorResponse("FORBIDDEN"));

  try {
    return ExampleService.getExampleUser(params.userId); // delegate to service (Model)
  } catch (err) {
    if (err instanceof ExampleService.ExampleServiceError)
      return status(404, errorResponse("NOT_FOUND"));
    throw err;
  }
}, {
  params: "Example.UserUpdateParams",
  response: { 200: "Example.UserUpdateBody", 401: ..., 403: ..., 404: ... }
})
```

## Fixed: broken model self-prefix (rule 4)

`src/models/example.model.ts` previously ended with:

```ts
.model({ ... })
.prefix("EM#");
```

Elysia's `.prefix()` takes **two** args — `(type, word)`, e.g.
`.prefix("model", "EM#")` — not a bare string. This call failed
`bun run typecheck` (`TS2554: Expected 2 arguments, but got 1`), and its
broken return type cascaded into `src/routes/example.ts`, degrading the
`body` param in the `POST /user/:userId` handler to `unknown` fields.

It was also redundant: the consuming route already re-namespaces via
`.use(ExampleModel).prefix("model", "Example.")`, so the model's own
`"EM#"` prefix was never the one actually used (routes reference
`"Example.UserUpdateParams"`, not `"EM#UserUpdateParams"`). Fix: drop the
self-prefix from the model entirely and let the consuming route own the
namespace — matches rule 4 above.

## Also fixed: relative import (rule 5)

`src/routes/rpkm/index.ts` imported `authMiddleware` via `../auth` instead
of the `@src/routes/auth` alias used everywhere else. Changed to match.

## Fixed: `t.Ref` collapsed `body` to `unknown` (not an MVC issue)

`src/models/example.model.ts` previously built `userUpdateRequestBody` /
`userUpdateBody` fields with `t.Ref("userName")` etc. `t.Ref`'s type
resolution doesn't survive the route's `.prefix("model", "Example.")`
rename, so `body` in the `POST /user/:userId` handler degraded to
`unknown` fields (runtime validation was unaffected, only the compile-time
type). Fix: define shared field schemas as plain consts
(`userName`/`userEmail`/`userRole`) and reuse them directly in the model
object instead of referencing by string via `t.Ref`.
