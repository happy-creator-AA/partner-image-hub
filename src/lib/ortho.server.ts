import { AwsClient } from "aws4fetch";
import type { R2Config } from "./cloudflare.server";

const ORTHO_PROMPT =
  "Top-down orthographic product view of this furniture. Show the entire piece from directly above, centered, on a pure solid white background. No shadows, no props, no floor, no decorative context. Clean professional furniture photography style.";

const TRANSPARENT_PROMPT =
  "Remove the background completely and keep only the furniture. The furniture should stay exactly the same shape, color, and proportions. Output with a transparent background.";

export type GenerateOrthoResult =
  | { ok: true; orthoImageId: string; publicUrl: string }
  | { ok: false; error: string; terminal: boolean };

export async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) return null;
  const blob = await res.blob();
  return new Uint8Array(await blob.arrayBuffer());
}

export async function uploadBytesToR2(
  config: R2Config,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });

  const url = new URL(`https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`);
  url.searchParams.set("X-Amz-Expires", "900");

  const signed = await client.sign(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
    }),
    { aws: { signQuery: true } },
  );

  const put = await fetch(signed.url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
  });

  if (!put.ok) {
    throw new Error(`R2 upload failed: ${put.status} ${await put.text()}`);
  }

  return `${config.publicBaseUrl}/${key}`;
}

export async function callOpenAIImageEdit(args: {
  model: "openai/gpt-image-2" | "openai/gpt-image-1-mini";
  imageBytes: Uint8Array;
  imageName: string;
  prompt: string;
  background?: "transparent";
  quality?: string;
}): Promise<{ b64: string } | { error: string; terminal: boolean }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) {
    return { error: "AI service is not configured.", terminal: true };
  }

  const form = new FormData();
  form.append("model", args.model);
  form.append("prompt", args.prompt);
  form.append("image", new Blob([args.imageBytes], { type: "image/png" }), args.imageName);
  if (args.background) form.append("background", args.background);
  if (args.quality) form.append("quality", args.quality);
  form.append("n", "1");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 402/403 are terminal credit/policy blocks; 429/5xx are transient.
    const terminal = res.status === 402 || res.status === 403 || (res.status >= 400 && res.status < 500);
    return { error: `Image generation failed (${res.status}): ${text}`, terminal };
  }

  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    return { error: "Image generation returned no image data.", terminal: true };
  }

  return { b64 };
}

export async function generateOrthographicImage(args: {
  referenceBytes: Uint8Array;
  referenceName: string;
}): Promise<{ bytes: Uint8Array; publicUrl: string } | { error: string; terminal: boolean }> {
  // Step 1: top-down orthographic view on white background.
  const step1 = await callOpenAIImageEdit({
    model: "openai/gpt-image-2",
    imageBytes: args.referenceBytes,
    imageName: args.referenceName,
    prompt: ORTHO_PROMPT,
    quality: "low",
  });
  if ("error" in step1) return step1;

  const step1Bytes = base64ToBytes(step1.b64);

  // Step 2: remove background with transparent output.
  const step2 = await callOpenAIImageEdit({
    model: "openai/gpt-image-1-mini",
    imageBytes: step1Bytes,
    imageName: "ortho-white.png",
    prompt: TRANSPARENT_PROMPT,
    background: "transparent",
    quality: "low",
  });
  if ("error" in step2) return step2;

  return { bytes: base64ToBytes(step2.b64), publicUrl: "" };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
