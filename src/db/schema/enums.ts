import { pgEnum } from "drizzle-orm/pg-core";

export const projectEnum = pgEnum("project", ["firstdate", "rpkm", "freshmennight"]);
export const roleEnum = pgEnum("role", ["student", "staff"]);
export const staffRoleEnum = pgEnum("staff_role", [
  "firstdate",
  "rpkm",
  "walkrally",
  "freshmennight"
]);

// name title. no _other column for "other".
export const prefixEnum = pgEnum("prefix", ["mr", "mrs", "ms", "not_specified", "other"]);

// label that tells the two stamp games apart (checkpoints.game) — not an FK.
export const gameEnum = pgEnum("game", ["jigsaw", "csr", "walkrally"]);

// walk rally activity type (8 rows: 3 workshops, 4 museums, 1 minigame)
export const walkRallyKindEnum = pgEnum("walk_rally_kind", ["workshop", "museum", "minigame"]);

// "other" -> vehicle_other free text
export const vehicleEnum = pgEnum("vehicle", [
  "private_car",
  "private_ev",
  "transit",
  "bus",
  "taxi",
  "motorcycle",
  "bike_walk",
  "other"
]);

// origin/destination are free text (district + province), not validated here. no _other columns.
