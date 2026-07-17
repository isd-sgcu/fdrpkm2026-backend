import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "@src/config";

// One S3 client for the whole app — works against real AWS S3 or any
// S3-compatible endpoint (Cloudflare R2, MinIO, ...) by pointing
// S3_ENDPOINT at it. R2 in particular has no concept of AWS regions, hence
// `region: "auto"`.
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

export const deleteObject = async (key: string): Promise<void> => {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
};

// Avatars are public content, so we serve them from a stable public base URL
// (ASSET_BASE_URL = the public bucket/CDN domain) and persist THAT into
// user.image. We deliberately do NOT fall back to a presigned GET: a presigned
// URL expires (default 1h), and persisting an expiring URL into the DB means
// every avatar 403s an hour after upload. Fail loudly instead so a
// misconfigured deploy is caught immediately rather than silently rotting.
export const getObjectUrl = async (key: string): Promise<string> => {
  if (!env.ASSET_BASE_URL) {
    throw new Error(
      "ASSET_BASE_URL is not set — cannot build a stable public avatar URL. " +
        "Set it to the public bucket/CDN base (e.g. https://storage.googleapis.com/<bucket>)."
    );
  }
  return `${env.ASSET_BASE_URL}/${key}`;
};
