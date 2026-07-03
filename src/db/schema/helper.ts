import { timestamp, uuid } from "drizzle-orm/pg-core";

// uuid pk, gen_random_uuid(). spread into every table.
export const id = {
  id: uuid("id").primaryKey().defaultRandom()
};

// created_at / updated_at. updated_at is kept current by a DB trigger (see the
// updated_at_triggers migration) so every writer touches it, not just drizzle .update().
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};
