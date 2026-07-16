import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import sharp from "sharp";

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
 * 512×512 center-cropped webp, store it, and point `user.image` at it.
 * `.rotate()` applies EXIF orientation before sharp strips metadata (which
 * also drops GPS tags — deliberate).
 */
const updateAvatar = async (
  userId: string,
  file: File,
  deps: AvatarDeps = {}
): Promise<{ url: string }> => {
  const database = deps.db ?? defaultDb;
  const storage = deps.storage ?? { uploadObject, getObjectUrl };

  let processed: Buffer;
  try {
    processed = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new AppError("BAD_REQUEST", { message: "File is not a decodable image." });
  }

  // ponytail: uuid keys per upload-guide.md; replaced avatars orphan in the
  // bucket — add a delete-old-key step if storage cost ever matters.
  const key = `avatars/${randomUUID()}.webp`;
  await storage.uploadObject(
    key,
    new File([new Uint8Array(processed)], key, { type: "image/webp" })
  );

  const url = await storage.getObjectUrl(key);
  await database.update(user).set({ image: url }).where(eq(user.id, userId));

  return { url };
};

export const AvatarService = { updateAvatar };
