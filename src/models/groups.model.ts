import { Elysia, t } from "elysia";
import { createSelectSchema } from "drizzle-typebox";

import { groupHouseChoices, groups } from "@src/db/schema";
import { spread } from "@src/utils/drizzle-typebox";

const _group = createSelectSchema(groups);
const group = t.Object(spread(_group));

const _groupHouseChoice = createSelectSchema(groupHouseChoices);
const groupHouseChoice = t.Object(spread(_groupHouseChoice));

const joinCode = t.String({
  title: "Join Code",
  description: "6-character code (uppercase letters + digits) used to join a group",
  pattern: "^[A-Z0-9]{6}$",
  example: "A1B2C3"
});

const groupMember = t.Object({
  userId: t.String({ format: "uuid", title: "Student ID" }),
  firstName: t.String({ title: "First Name" }),
  lastName: t.String({ title: "Last Name" }),
  nickname: t.Nullable(t.String({ title: "Nickname" })),
  isLeader: t.Boolean({
    title: "Is Leader",
    description: "true if this member is the group's leader"
  }),
  avatarUrl: t.Nullable(t.String({ title: "Avatar URL" }))
});

export const GroupsModel = new Elysia().model({
  group,
  groupHouseChoice,
  groupMember,
  groupWithMembers: t.Object({
    ...group.properties,
    members: t.Array(groupMember)
  }),
  joinBody: t.Object({
    joinCode
  }),
  joinCodeResponse: t.Object({
    joinCode
  }),
  housePreferencesBody: t.Object({
    houseIds: t.Array(t.String({ format: "uuid", title: "House ID" }), {
      title: "House IDs",
      description: "Ranked house IDs, most preferred first (rank = index + 1)",
      minItems: 1,
      maxItems: 5,
      uniqueItems: true
    })
  }),
  housePreferencesResponse: t.Object({
    housePreferences: t.Array(groupHouseChoice)
  }),
  memberParams: t.Object({
    userId: t.String({ format: "uuid", title: "Student ID" })
  })
});
