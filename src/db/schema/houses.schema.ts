import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";

import { id, timestamps } from "./helper";
import { students } from "./identity.schema";

// 22 houses. names/desc live in frontend i18n — only code here.
export const houses = t.pgTable("houses", {
  ...id,
  code: t.text("code").notNull().unique(),
  capacity: t.integer("capacity"),
  info: t.jsonb("info").$type<Record<string, unknown>>(),
  ...timestamps
});

// friend group (<=4). leaderId runs it; members live on registrations.groupId (leader is also a member).
// assignedHouseId set by the draw. joinCode = regenerable 6-digit.
export const groups = t.pgTable("groups", {
  ...id,
  leaderId: t
    .uuid("leader_id")
    .notNull()
    .references(() => students.id, { onDelete: "restrict" }),
  joinCode: t.text("join_code").notNull().unique(),
  assignedHouseId: t
    .uuid("assigned_house_id")
    .references(() => houses.id, { onDelete: "restrict" }),
  assignedAt: t.timestamp("assigned_at", { withTimezone: true }),
  ...timestamps
});

// ranked picks 1..5, leader writes for the whole group.
export const groupHouseChoices = t.pgTable(
  "group_house_choices",
  {
    ...id,
    groupId: t
      .uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    houseId: t
      .uuid("house_id")
      .notNull()
      .references(() => houses.id, { onDelete: "restrict" }),
    rank: t.integer("rank").notNull(),
    ...timestamps
  },
  (table) => [
    t.unique("group_house_choices_group_rank_unique").on(table.groupId, table.rank),
    t.unique("group_house_choices_group_house_unique").on(table.groupId, table.houseId),
    t.index("group_house_choices_house_id_idx").on(table.houseId),
    t.check("group_house_choices_rank_check", sql`${table.rank} between 1 and 5`)
  ]
);

export type House = typeof houses.$inferSelect;
export type NewHouse = typeof houses.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupHouseChoice = typeof groupHouseChoices.$inferSelect;
export type NewGroupHouseChoice = typeof groupHouseChoices.$inferInsert;
