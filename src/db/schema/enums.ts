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

// district codes shared by origin + destination. "other" -> matching *_other free text.
const DISTRICT_CODES = [
  "ratchathewi",
  "watthana",
  "khlong_toei",
  "sathon",
  "bang_rak",
  "phaya_thai",
  "din_daeng",
  "huai_khwang",
  "other"
] as const;

export const originEnum = pgEnum("travel_origin", DISTRICT_CODES);
// destination = districts + chula
export const destinationEnum = pgEnum("travel_destination", [...DISTRICT_CODES, "chula"] as const);
