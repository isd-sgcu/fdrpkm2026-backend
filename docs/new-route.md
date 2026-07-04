# Adding a new route + service

Follow this when adding a real feature. See `docs/mvc.md` for the layering
rules this shape enforces; this doc is the step-by-step for creating one.
Reference implementation: `src/models/example.model.ts` +
`src/services/example.service.ts` + `src/routes/example.ts`.

## 1. Service (`src/services/<feature>.service.ts`)

Owns storage + business rules. Never imports Elysia, never touches HTTP.

```ts
import type { AppErrorCode } from "@src/utils";

export type FeatureThing = {
  id: string;
  // ...fields
};

const store = new Map<string, FeatureThing>();

/** Thrown on expected business failures; controller maps `code` to an HTTP status. */
class FeatureServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

const getThing = (id: string): FeatureThing => {
  const thing = store.get(id);
  if (!thing) throw new FeatureServiceError("NOT_FOUND");
  return thing;
};

// One namespace object per feature — routes call `FeatureService.getThing(...)`.
export const FeatureService = {
  FeatureServiceError,
  getThing
};
```

- Add real errors from `AppErrorCode` (`src/utils/error.ts`) as needed — sort
  new entries alphabetically by key.
- Swap the `Map` for real Drizzle queries (`src/db`) when wiring actual
  storage; keep function signatures stable so the controller doesn't change.

## 2. Model / DTO (`src/models/<feature>.model.ts`)

Schema-only. No logic, no I/O.

```ts
import { Elysia, t } from "elysia";

// Shared field schemas as plain consts, reused directly in objects below.
// Do NOT use t.Ref to cross-reference sibling schemas here — its type
// resolution doesn't survive the route's `.prefix("model", "Feature.")`
// rename and silently collapses `body` to `unknown` at the type level
// (runtime validation still works; only TS inference breaks). See
// docs/mvc.md for the incident this rule comes from.
const thingId = t.String({ format: "uuid", title: "Thing ID" });

export const FeatureModel = new Elysia().model({
  thingId,
  thingParams: t.Object({ id: thingId }),
  thingBody: t.Object({
    id: thingId
    // ...fields
  })
});
// No self-prefix here — the consuming route applies its own namespace via
// `.use(FeatureModel).prefix("model", "Feature.")`.
```

## 3. Route / controller (`src/routes/<feature>/index.ts` or `<feature>.ts`)

Thin: auth guard → validate → call service → map result/error to HTTP.

```ts
import { Elysia, t } from "elysia";
import { errorResponse, tErrorResponse } from "@src/utils";
import { FeatureModel } from "@src/models/feature.model";
import { FeatureService } from "@src/services/feature.service";
import { authMiddleware } from "@src/routes/auth";

export const featureRoutes = new Elysia({ prefix: "/feature" })
  .use(authMiddleware)
  .use(FeatureModel)
  .prefix("model", "Feature.")
  .get(
    "/:id",
    ({ auth, status, params }) => {
      if (!auth.user)
        return status(401, errorResponse("UNAUTHORIZED", { message: "Login required" }));

      try {
        return FeatureService.getThing(params.id);
      } catch (err) {
        if (err instanceof FeatureService.FeatureServiceError)
          return status(404, errorResponse("NOT_FOUND"));
        throw err;
      }
    },
    {
      params: "Feature.thingParams",
      response: {
        200: "Feature.thingBody",
        401: tErrorResponse("UNAUTHORIZED", t.Object({ message: t.String() })),
        404: tErrorResponse("NOT_FOUND")
      }
    }
  );
```

- Prefer `{ auth: true }` macro (see `/protected` example in
  `src/routes/example.ts`) over manual `if (!auth.user)` checks once the
  route has nothing else to do pre-auth — both are fine, pick one
  consistently per route.
- Every error status a handler can return must be declared in
  `response:` — Elysia rejects undeclared response shapes in dev.
- Imports use the `@src/` alias, not relative paths.

## 4. Mount it (`src/routes/index.ts`)

```ts
import { featureRoutes } from "./feature";
// ...
export const apiRoutes = new Elysia({ prefix: "/v1" }).use(featureRoutes);
// ...
```

`exampleRoutes` is the one exception — only mounted when
`NODE_ENV=development`, since it's a reference, not a real feature.

## 5. Verify

```sh
bun run typecheck
bun test
```

Then hit `http://localhost:3000/openapi` to confirm the new route/schemas
show up in the generated docs.
