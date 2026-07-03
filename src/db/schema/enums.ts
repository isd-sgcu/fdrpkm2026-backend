import { pgEnum } from "drizzle-orm/pg-core";

export const projectEnum = pgEnum("project", ["firstdate", "rpkm"]);
export const roleEnum = pgEnum("role", ["student", "staff"]);

// name title. no _other column for "other".
export const prefixEnum = pgEnum("prefix", ["mr", "mrs", "ms", "not_specified", "other"]);

// label that tells the two stamp games apart (checkpoints.game) — not an FK.
export const gameEnum = pgEnum("game", ["jigsaw", "csr"]);

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
