import { Elysia, t } from "elysia";
import { createSelectSchema } from "drizzle-typebox";

import { houses } from "@src/db/schema";
import { spread } from "@src/utils/drizzle-typebox";

// drizzle-typebox turns the Drizzle table definition into TypeBox schema —
// one source of truth for both the DB column types and the API response
// shape/OpenAPI doc. Assign to an intermediate variable before feeding it
// into further t.* calls (t.Object/t.Omit/etc directly on the
// createSelectSchema(...) result can blow up TS into an infinite type
// instantiation loop — see elysiajs.com/integrations/drizzle).
const _house = createSelectSchema(houses);
const house = t.Object(spread(_house));

// availableInRound2 isn't a DB column — it's derived from the hardcoded
// ROUND2_HOUSE_CODES whitelist (src/constants.ts) — so it's merged onto the
// drizzle-typebox shape by hand instead of coming from spread(_house).
const houseWithAvailability = t.Object({
  ...house.properties,
  availableInRound2: t.Boolean({
    title: "Available In Round 2",
    description:
      "Whether this house is selectable in round 2 — false means the frontend should gray it out"
  })
});

export const HousesModel = new Elysia().model({
  house,
  houseWithAvailability,
  houseId: t.Object({
    id: t.String({ format: "uuid", title: "House ID" })
  }),
  houseStat: t.Object({
    houseId: t.String({ format: "uuid", title: "House ID" }),
    code: t.String({ title: "House Code" }),
    count: t.Integer({
      title: "Applicant Count",
      description: "Students who applied to this house — counts a group's rank-1 pick only"
    })
  }),
  houseResult: t.Nullable(house)
});
// No self-prefix — the consuming route applies its own namespace, same
// convention as ExampleModel (see docs/mvc.md rule 4).
