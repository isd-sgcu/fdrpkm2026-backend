import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

const PRESIGNED_GET_EXPIRY_SECONDS = 3600;

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

// If ASSET_BASE_URL is set (public bucket/CDN domain), build a direct URL —
// no request to S3 needed. Otherwise fall back to a presigned GET, which
// works for private buckets but expires and must be re-issued on read.
export const getObjectUrl = (key: string): Promise<string> => {
  if (env.ASSET_BASE_URL) return Promise.resolve(`${env.ASSET_BASE_URL}/${key}`);

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn: PRESIGNED_GET_EXPIRY_SECONDS
  });
};
