import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db as defaultDb, type Database } from "@src/db";
import { user } from "@src/db/schema";
import { AppError } from "@src/utils";
import { deleteObject, getObjectUrl, uploadObject } from "@src/utils/storage";

// 512px covers every avatar render size in use; webp@80 keeps files ~tens of KB.
const AVATAR_SIZE = 512;
const WEBP_QUALITY = 80;
// Cap decoded pixels so a tiny-but-huge-dimension "pixel bomb" (a <1MB PNG can
// decode to ~1GB of RGBA) can't OOM the container. 24MP covers any real phone
// photo (a 48MP sensor bins to 12MP by default); larger inputs are rejected as
// BAD_REQUEST. ponytail: raise if genuine >24MP uploads ever get reported.
const MAX_DECODE_PIXELS = 24_000_000;
// Matches our own uploaded keys ("avatars/<uuid>.webp") anywhere in a URL, so
// we can delete the previous object on replace without depending on the base
// URL. Google-seeded image URLs don't match, so they're never touched.
const AVATAR_KEY_RE = /avatars\/[0-9a-f-]{36}\.webp$/;

export type AvatarDeps = {
  db?: Database;
  storage?: {
    uploadObject: typeof uploadObject;
    getObjectUrl: typeof getObjectUrl;
    deleteObject: typeof deleteObject;
  };
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
  const storage = deps.storage ?? { uploadObject, getObjectUrl, deleteObject };

  const [existing] = await database
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, userId));

  let processed: Uint8Array;
  try {
    processed = await new Bun.Image(await file.bytes(), { maxPixels: MAX_DECODE_PIXELS })
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .bytes();
  } catch {
    throw new AppError("BAD_REQUEST", {
      message: "File is not a decodable image or its dimensions are too large."
    });
  }

  const key = `avatars/${randomUUID()}.webp`;
  // .slice() copies into a plain ArrayBuffer-backed view — File's BlobPart
  // type rejects the ArrayBufferLike-backed one .bytes() returns.
  await storage.uploadObject(key, new File([processed.slice()], key, { type: "image/webp" }));

  const url = await storage.getObjectUrl(key);
  await database.update(user).set({ image: url }).where(eq(user.id, userId));

  // Best-effort delete of the previous avatar so replaced images don't orphan
  // in the bucket. Failure here just leaves one stale object — not worth
  // failing the request the user already sees as successful.
  const oldKey = existing?.image?.match(AVATAR_KEY_RE)?.[0];
  if (oldKey && oldKey !== key) {
    try {
      await storage.deleteObject(oldKey);
    } catch {
      /* stale object left behind; acceptable */
    }
  }

  return { url };
};

export const AvatarService = { updateAvatar };
