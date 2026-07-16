import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";

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

/** Minimal 24-bit BMP (Bun.Image decodes BMP) — no image lib needed to build
 *  a test fixture of arbitrary dimensions. */
function makeBmp(width: number, height: number) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buf = Buffer.alloc(54 + pixelBytes);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset
  buf.writeUInt32LE(40, 14); // BITMAPINFOHEADER size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.fill(0x7f, 54); // grey pixels
  return Uint8Array.from(buf);
}

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

  it("recompresses to a ≤512px webp, stores it, and updates user.image", async () => {
    // 2000x1000 — big and non-square, so downscale + aspect preservation both show.
    const file = new File([makeBmp(2000, 1000)], "me.bmp", { type: "image/png" });

    const { url } = await AvatarService.updateAvatar(USER_ID, file, injected());

    expect(uploads.length).toBe(1);
    const stored = uploads[0];
    expect(stored.key).toMatch(/^avatars\/[0-9a-f-]{36}\.webp$/);
    expect(url).toBe(`https://assets.test/${stored.key}`);

    const meta = await new Bun.Image(await stored.file.bytes()).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(256);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, USER_ID));
    expect(row.image).toBe(url);
  });
});
