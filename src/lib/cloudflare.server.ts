import { AwsClient } from "aws4fetch";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

export function readR2Config(): R2Config | null {
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET_NAME"];
  const publicBaseUrl = process.env["R2_PUBLIC_BASE_URL"];

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

export function objectUrl(config: R2Config, key: string) {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
}

export function publicUrl(config: R2Config, key: string) {
  return `${config.publicBaseUrl}/${key}`;
}

/** Presigned PUT URL so the browser uploads straight to Cloudflare R2. */
export async function presignPut(config: R2Config, key: string, expiresSeconds = 900) {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });

  const url = new URL(objectUrl(config, key));
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));

  const signed = await client.sign(new Request(url, { method: "PUT" }), {
    aws: { signQuery: true },
  });

  return signed.url;
}

export function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
}
