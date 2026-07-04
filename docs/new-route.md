# Adding a new route + service

Follow this when adding a real feature. See `docs/mvc.md` for the layering
rules this shape enforces; this doc is the step-by-step for creating one.
Reference implementation: `src/models/example.model.ts` +
`src/services/example.service.ts` + `src/routes/example.ts`.

Building a file upload route specifically? See [upload-guide.md](./upload-guide.md)
instead — same shape, plus the storage/validation pieces.

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

### Querying the database instead of a `Map`

Real example: `src/services/rpkm.service.ts` (`listHouses`/`getHouse`).

```ts
import { eq } from "drizzle-orm";
import type { AppErrorCode } from "@src/utils";
import { db } from "@src/db";
import { things, type Thing } from "@src/db/schema";

class FeatureServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

// List — plain select, no filter.
const listThings = (): Promise<Thing[]> => db.select().from(things);

// Get one — filter with `eq`/`and`/`or` (drizzle-orm), throw the
// domain error on miss so the controller can map it to 404.
const getThing = async (id: string): Promise<Thing> => {
  const [thing] = await db.select().from(things).where(eq(things.id, id));
  if (!thing) throw new FeatureServiceError("NOT_FOUND");
  return thing;
};

// Insert
const createThing = async (input: typeof things.$inferInsert): Promise<Thing> => {
  const [thing] = await db.insert(things).values(input).returning();
  return thing;
};

export const FeatureService = {
  FeatureServiceError,
  listThings,
  getThing,
  createThing
};
```

- `db` is the shared Drizzle instance from `src/db` — PGlite locally
  (`DATABASE_FILE`) when `NODE_ENV=development` and `DATABASE_URL` is unset,
  real Postgres otherwise. Same `db.select()`/`.insert()`/`.update()` API
  either way, no branching needed in the service.
- `table.$inferSelect` / `table.$inferInsert` (from the schema file, e.g.
  `src/db/schema/houses.schema.ts` exports `House`/`NewHouse`) give you the
  row/insert types without hand-duplicating fields.
- If the response schema is generated from the same table via
  `drizzle-typebox` (see step 2 below), the service's return type and the
  route's `response:` schema both trace back to one table definition.

## 2. Model / DTO (`src/models/<feature>.model.ts`)

Schema-only. No logic, no I/O. If the DTO mirrors a Drizzle table 1:1 (or
close to it), generate it from the table instead of hand-writing `t.Object`
— see [drizzle-elysia.md](./drizzle-elysia.md).

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

### If the DTO is backed by a Drizzle table

Generate the schema from the table with `drizzle-typebox` instead of
hand-writing `t.Object` — one source of truth for DB columns + API shape.
Real example: `src/models/houses.model.ts` /
`src/services/rpkm.service.ts` / `src/routes/rpkm/index.ts`
(`GET /v1/rpkm/houses`). Full pattern + gotchas: [drizzle-elysia.md](./drizzle-elysia.md).

```ts
import { Elysia, t } from "elysia";
import { createSelectSchema } from "drizzle-typebox";
import { things } from "@src/db/schema";
import { spread } from "@src/utils/drizzle-typebox";

// Assign to an intermediate variable before further t.* calls —
// feeding createSelectSchema(...) straight into t.Object/t.Omit/etc
// can blow up TS into an infinite type-instantiation loop.
const _thing = createSelectSchema(things);
const thing = t.Object(spread(_thing));

export const FeatureModel = new Elysia().model({
  thing,
  thingParams: t.Object({ id: t.String({ format: "uuid" }) })
});
```

Two gotchas this pattern runs into that the hand-written version above doesn't:

- **`.prefix("model", word)` capitalizes keys.** Registering `thing` here
  means the consuming route references it as `"Feature.Thing"`
  (capitalized), not `"Feature.thing"` — TS catches the wrong case at the
  call site (`TS2820`), but it's easy to type the lowercase form out of habit.
- **`t.Ref` is fine here, just not _inside_ `.model({...})`.** Wrapping a
  model reference in `t.Array(t.Ref("Feature.Thing"))` at the route/handler
  level (e.g. a list endpoint) works normally — it's only `t.Ref` used to
  cross-reference a _sibling_ schema inside the `.model({...})` object
  itself that breaks under the prefix rename (see the hand-written example
  above, and the incident in `docs/mvc.md`).

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
