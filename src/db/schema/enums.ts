import { pgEnum } from "drizzle-orm/pg-core";

export const projectEnum = pgEnum("project", ["firstdate", "rpkm"]);
export const roleEnum = pgEnum("role", ["student", "staff"]);

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

// Districts (origin/destination) are NOT validated in the backend — the frontend sends the
// district code as free text. The matching *_other free text still applies when the code is "other".
