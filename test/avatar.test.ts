import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import sharp from "sharp";

import type { Database } from "../src/db";
import * as schema from "../src/db/schema";
import { AvatarService } from "../src/services/avatar.service";
import { AppError } from "../src/utils";

let client: PGlite;
let db: PgliteDatabase<typeof schema>;

const uploads: { key: string; file: File }[] = [];
const storage = {
  uploadObject: async (key: string, file: File) => {
    uploads.push({ key, file });
  },
  getObjectUrl: async (key: string) => `https://assets.test/${key}`
};
const injected = () => ({ db: db as unknown as Database, storage });

const USER_ID = "avatar-test-user";

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(schema.user).values({
    id: USER_ID,
    name: "Avatar Tester",
    email: "6900000042@student.chula.ac.th"
  });
});

afterAll(async () => {
  await client.close();
});

describe("AvatarService.updateAvatar", () => {
  it("rejects an undecodable file with BAD_REQUEST before touching storage", async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4])], "junk.png", { type: "image/png" });

    await expect(AvatarService.updateAvatar(USER_ID, junk, injected())).rejects.toThrow(AppError);
    expect(uploads.length).toBe(0);
  });

  it("recompresses to 512x512 webp, stores it, and updates user.image", async () => {
    // 2000x1000 jpeg — big and non-square, so resize + center-crop both apply.
    const source = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 30, b: 30 } }
    })
      .jpeg()
      .toBuffer();
    const file = new File([new Uint8Array(source)], "me.jpg", { type: "image/jpeg" });

    const { url } = await AvatarService.updateAvatar(USER_ID, file, injected());

    expect(uploads.length).toBe(1);
    const stored = uploads[0];
    expect(stored.key).toMatch(/^avatars\/[0-9a-f-]{36}\.webp$/);
    expect(url).toBe(`https://assets.test/${stored.key}`);

    const meta = await sharp(Buffer.from(await stored.file.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, USER_ID));
    expect(row.image).toBe(url);
  });
});
