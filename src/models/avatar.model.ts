import { Elysia, t } from "elysia";

/**
 * DTOs for the shared avatar upload (POST /v1/me/avatar). Schema-only (see
 * docs/mvc.md). The 15m cap is the raw upload limit — the service recompresses
 * to a small webp before storage, so large phone photos are accepted.
 *
 * Consuming route applies its namespace via
 * `.use(AvatarModel).prefix("model", "Avatar.")`.
 */
const uploadBody = t.Object({
  file: t.File({
    type: ["image/jpeg", "image/png", "image/webp"],
    maxSize: "15m"
  })
});

const uploadResult = t.Object({
  url: t.String({ description: "Public URL of the processed avatar." })
});

export const AvatarModel = new Elysia().model({
  uploadBody,
  uploadResult
});
