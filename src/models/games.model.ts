import { Elysia, t } from "elysia";
import { createSelectSchema } from "drizzle-typebox";

import { checkpoints, scans } from "@src/db/schema";
import { spread } from "@src/utils/drizzle-typebox";

const _checkpoint = createSelectSchema(checkpoints);
const checkpoint = t.Object(spread(_checkpoint));

const _scan = createSelectSchema(scans);
const scan = t.Object(spread(_scan));

// check game type: jigsaw or csr
const gameType = t.Union([t.Literal("jigsaw"), t.Literal("csr")], { title: "Game Type" });

const collectedCheckpoint = t.Object({
  checkpointId: t.String({ format: "uuid", title: "Checkpoint ID" }),
  code: t.String({ title: "Checkpoint Code" }),
  game: gameType,
  scannedAt: t.Date({ title: "Scanned At" })
});

export const GamesModel = new Elysia().model({
  checkpoint,
  checkpointId: t.Object({
    id: t.String({ format: "uuid", title: "Checkpoint ID" })
  }),
  scan,
  scanId: t.Object({
    id: t.String({ format: "uuid", title: "Scan ID" })
  }),
  gameTypeParams: t.Object({
    gameType: t.String({ title: "Game Type", description: "jigsaw | csr" })
  }),
  collectedCheckpoint,
  progressResponse: t.Object({
    collected: t.Array(collectedCheckpoint)
  }),
  collectCheckpointBody: t.Object({
    code: t.String({ minLength: 1, title: "Checkpoint Code" }),
    lat: t.Number({ title: "Latitude" }),
    lng: t.Number({ title: "Longitude" })
  }),
  collectCheckpointResponse: t.Object({
    checkpointId: t.String({ format: "uuid", title: "Checkpoint ID" }),
    code: t.String({ title: "Checkpoint Code" }),
    scannedAt: t.Date({ title: "Scanned At" })
  })
});
