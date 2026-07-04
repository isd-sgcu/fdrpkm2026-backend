# Drizzle ↔ Elysia integration

Follows [elysiajs.com/integrations/drizzle](https://elysiajs.com/integrations/drizzle):
turn a Drizzle table into TypeBox schema with `drizzle-typebox`, so the DB
row shape _is_ the API response/validation/OpenAPI schema — one source of
truth instead of hand-duplicating a `t.Object`.

Reference implementation: `src/models/houses.model.ts` +
`src/services/rpkm.service.ts` + `src/routes/rpkm/index.ts`
(`GET /v1/rpkm/houses`, `GET /v1/rpkm/houses/:id`).

## Packages

`drizzle-typebox` is installed alongside the existing `drizzle-orm`. Its
peer requirement is `@sinclair/typebox >=0.34.8` — this repo already has
`0.34.49` via Elysia, so **no version pin/override needed** here (the
official guide's `overrides: { "@sinclair/typebox": "0.32.4" }` is for
older typebox majors; check `bun pm ls @sinclair/typebox` before copying
that pin into a different project).

## Pattern

```ts
// src/models/<feature>.model.ts
import { Elysia, t } from "elysia";
import { createSelectSchema } from "drizzle-typebox";
import { houses } from "@src/db/schema";
import { spread } from "@src/utils/drizzle-typebox";

// Assign to an intermediate variable before further t.* calls — feeding
// createSelectSchema(...)'s result directly into t.Object/t.Omit/etc can
// blow up TS into an infinite type-instantiation loop.
const _house = createSelectSchema(houses);
const house = t.Object(spread(_house));

export const HousesModel = new Elysia().model({
  house,
  houseId: t.Object({ id: t.String({ format: "uuid" }) })
});
```

- `createSelectSchema(table)` → schema matching what a `SELECT` returns.
  `createInsertSchema`/`createUpdateSchema` exist too, for request bodies.
- `spread()` (`src/utils/drizzle-typebox.ts`) pulls a schema's
  `.properties` back out so they can be reused inside another `t.Object`
  (e.g. to compose a subset, or mix DB fields with extra ones) — the guide's
  pattern, since `drizzle-typebox` itself doesn't export this helper.
- Model has **no self-prefix** — same convention as `ExampleModel`
  (`docs/mvc.md` rule 4): the consuming route applies its own namespace via
  `.use(HousesModel).prefix("model", "Rpkm.")`.

## Gotcha: `.prefix("model", word)` capitalizes keys

Registering `house`/`houseId` (camelCase) and prefixing with `"Rpkm."`
produces reference strings `"Rpkm.House"`/`"Rpkm.HouseId"` — **capitalized**,
not `"Rpkm.house"`. Reference the capitalized form in routes:

```ts
.get("/houses/:id", handler, {
  params: "Rpkm.HouseId",
  response: { 200: "Rpkm.House", 404: tErrorResponse("NOT_FOUND") }
})
```

TS catches a wrong-case string at the call site (`TS2820`, "did you mean...")
— this is a compile error, not a silent runtime miss.

## Gotcha: don't reuse the `t.Ref`-in-model bug (see docs/mvc.md)

The capitalization gotcha above is unrelated to the earlier `t.Ref` bug
fixed in `src/models/example.model.ts`: that one was `t.Ref` used _inside_
a `.model({...})` definition to cross-reference a sibling field, which
breaks under the route's prefix rename. Referencing a model by its
prefixed string in `response:`/`params:` (as above), or `t.Ref("Rpkm.House")`
to wrap a model in `t.Array(...)` at the route/handler level (see
`GET /houses` in `src/routes/rpkm/index.ts`), is the normal, working
pattern — only cross-referencing inside the model object itself is the
trap.

## Wiring a new table

1. Define the table in `src/db/schema/<feature>.schema.ts` (existing).
2. `src/models/<feature>.model.ts` — `createSelectSchema`/`createInsertSchema`
   - `spread`, per the pattern above.
3. `src/services/<feature>.service.ts` — query with `db.select().from(table)`,
   `.where(eq(table.col, value))` etc (`drizzle-orm`'s `eq`/`and`/`or`).
4. Route — `.use(FeatureModel).prefix("model", "Feature.")`, reference
   schemas by their capitalized string.

See `docs/new-route.md` for the rest of the route/service scaffolding this
slots into.
