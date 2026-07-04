# Adding a file upload feature

No upload _route_ exists in this repo yet, but the storage plumbing does
(`src/utils/storage.ts`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`,
S3-compatible — Cloudflare R2 or real AWS S3). This is the pattern to
follow when an upload route lands (e.g. student photo, entry-scan proof).
Same MVC split as `docs/new-route.md`, plus the upload-specific pieces below.

## 1. Validate the file at the route boundary

Elysia's `t.File`/`t.Files` validate size/mimetype from multipart form data
before your handler runs — reject bad uploads without touching storage.

```ts
import { Elysia, t } from "elysia";

export const FeatureModel = new Elysia().model({
  uploadBody: t.Object({
    file: t.File({
      type: ["image/jpeg", "image/png", "image/webp"],
      maxSize: "5m"
    })
  })
});
```

```ts
.post(
  "/upload",
  ({ body }) => FeatureService.storeUpload(body.file),
  {
    auth: true,
    body: "Feature.uploadBody",
    response: {
      200: t.Object({ url: t.String() }),
      401: tErrorResponse("UNAUTHORIZED", t.Object({ message: t.String() }))
    }
  }
)
```

`body.file` is a standard `File`/`Blob` — `file.name`, `file.type`,
`file.size`, `await file.arrayBuffer()`/`.bytes()` all work.

## 2. Storage lives in the service, not the route

Same rule as any service (`docs/mvc.md` rule 2/3): the route never touches
a bucket or the filesystem directly — it hands the validated `File` to the
service and gets back a URL/key.

```ts
// src/services/feature.service.ts
import { randomUUID } from "node:crypto";
import type { AppErrorCode } from "@src/utils";
import { getObjectUrl, uploadObject } from "@src/utils/storage";

class FeatureServiceError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}

const storeUpload = async (file: File): Promise<{ url: string; key: string }> => {
  const ext = file.name.split(".").pop();
  const key = `uploads/${randomUUID()}.${ext}`;

  await uploadObject(key, file);

  return { url: await getObjectUrl(key), key };
};

export const FeatureService = {
  FeatureServiceError,
  storeUpload
};
```

Keeping storage behind `uploadObject`/`getObjectUrl` (`src/utils/storage.ts`)
means the service never touches the S3 client directly — same reasoning as
`db` in `src/db/index.ts` hiding PGlite-vs-Postgres behind one interface.

## 3. Storage backend — S3-compatible (Cloudflare R2)

This repo uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
against an S3-compatible endpoint. Real AWS S3 works unmodified; for
Cloudflare R2 (recommended — no egress fees, same S3 API), point
`S3_ENDPOINT` at the account's R2 S3 endpoint and use `region: "auto"`
(R2 has no concept of AWS regions).

`src/utils/storage.ts`:

```ts
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@src/config";

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT || undefined,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  }
});

export const uploadObject = async (key: string, file: File): Promise<void> => {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type || "application/octet-stream"
    })
  );
};

// ASSET_BASE_URL set (public bucket/CDN domain) -> direct URL, no S3 round
// trip. Otherwise a presigned GET (works for a private bucket, expires).
export const getObjectUrl = (key: string): Promise<string> => {
  if (env.ASSET_BASE_URL) return Promise.resolve(`${env.ASSET_BASE_URL}/${key}`);

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn: 3600
  });
};
```

Env vars (`.env.example` / `src/config/env.ts`):

```sh
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=fdrpkm-uploads
S3_ACCESS_KEY_ID=your_access_key_id
S3_SECRET_ACCESS_KEY=your_secret_access_key
# Public bucket/CDN domain to build read URLs from. Leave unset to use presigned GET URLs instead.
ASSET_BASE_URL=
```

There's no local-disk fallback for dev — point `S3_*` at a real (or R2
free-tier) bucket even locally, so dev and prod exercise the same code
path. Use the `cloudflare` skill when provisioning the R2 bucket itself.

## 4. Record metadata, don't just return a URL

If the upload is tied to a domain object (a student's photo, a scan proof),
store the key/URL + owner + timestamp as a normal Drizzle row — same as any
other table (`docs/new-route.md` step 2, `docs/drizzle-elysia.md`).
Don't invent a separate ad-hoc "files" concept outside the schema; a
`photoKey`/`photoUrl` column on the relevant table (or a small `media` table
if several features need it) is enough.

## 5. Auth + ownership

Uploads are almost always `auth: true` (see `docs/auth/backend-usage.md`).
If a user should only be able to upload for _their own_ record, check
ownership the same way `example.ts`'s manual-check shape does — compare
`user.userId` against the target resource's owner before calling the
service, not inside it.

## 6. Verify

- Reject a request with no file / wrong mimetype / oversized file — confirm
  Elysia's `body:` validation catches it before the handler runs (400, not
  a service-level error).
- Upload a real file end-to-end and confirm the stored object is
  retrievable at the returned URL.
- `bun run typecheck && bun run lint && bun test`.
