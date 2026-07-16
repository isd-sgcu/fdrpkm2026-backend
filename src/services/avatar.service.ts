import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db as defaultDb, type Database } from "@src/db";
import { user } from "@src/db/schema";
import { AppError } from "@src/utils";
import { getObjectUrl, uploadObject } from "@src/utils/storage";

// 512px covers every avatar render size in use; webp@80 keeps files ~tens of KB.
const AVATAR_SIZE = 512;
const WEBP_QUALITY = 80;

export type AvatarDeps = {
  db?: Database;
  storage?: { uploadObject: typeof uploadObject; getObjectUrl: typeof getObjectUrl };
};

/**
 * Recompress the uploaded image (route-validated jpeg/png/webp, ≤15m) to a
 * ≤512px webp via Bun.Image (zero-dep, needs bun ≥1.3.14), store it, and
 * point `user.image` at it. EXIF orientation is auto-applied and re-encoding
 * drops all metadata including GPS tags — deliberate.
 *
 * ponytail: fit "inside" preserves aspect ratio (Bun.Image has no "cover");
 * every consumer renders with CSS object-cover, so the visual crop is
 * identical. Switch to a manual center-crop if a hard-square contract is
 * ever needed.
 */
const updateAvatar = async (
  userId: string,
  file: File,
  deps: AvatarDeps = {}
): Promise<{ url: string }> => {
  const database = deps.db ?? defaultDb;
  const storage = deps.storage ?? { uploadObject, getObjectUrl };

  let processed: Uint8Array;
  try {
    processed = await new Bun.Image(await file.bytes())
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .bytes();
  } catch {
    throw new AppError("BAD_REQUEST", { message: "File is not a decodable image." });
  }

  // ponytail: uuid keys per upload-guide.md; replaced avatars orphan in the
  // bucket — add a delete-old-key step if storage cost ever matters.
  const key = `avatars/${randomUUID()}.webp`;
  // .slice() copies into a plain ArrayBuffer-backed view — File's BlobPart
  // type rejects the ArrayBufferLike-backed one .bytes() returns.
  await storage.uploadObject(key, new File([processed.slice()], key, { type: "image/webp" }));

  const url = await storage.getObjectUrl(key);
  await database.update(user).set({ image: url }).where(eq(user.id, userId));

  return { url };
};

export const AvatarService = { updateAvatar };
