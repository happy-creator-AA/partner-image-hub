# Auto orthographic/top-view generation on admin approval

When an admin confirms an item, the system automatically generates a clean top-down orthographic view from the item's reference image, then saves it to R2 and updates the database.

## Important trade-off: transparent background with OpenAI

OpenAI's `gpt-image-2` rejects the `background: "transparent"` parameter; it only supports opaque backgrounds. In the OpenAI family, only `gpt-image-1-mini` supports transparent backgrounds. To get both **OpenAI quality** and **transparency**, the plan uses:

- `openai/gpt-image-2` to generate the top-down orthographic view on a **solid white background** (best quality, correct geometry).
- A second pass with `openai/gpt-image-1-mini` and `background: "transparent"` to remove the white background and produce a PNG with alpha.

This is two AI calls per item, but gives the best result for the chosen constraints. If you prefer fewer credits, we can use `gpt-image-1-mini` alone for both steps, sacrificing a little geometric accuracy.

## Pipeline

```text
Admin clicks "Approve"
  → fetch reference image from R2
  → Step 1: gpt-image-2 edits → top-down view on white background
  → Step 2: gpt-image-1-mini → remove background, transparent PNG
  → Upload final PNG to R2 under key `items/{item_id}/orthographic.png`
  → Insert row into `item_images` (kind='orthographic', variant='orthographic')
  → Set item.processing = 'ready'
  → Set item.status = 'approved'
```

## What changes in the database

No new tables are required. We reuse `item_images` and add `processing` values:

- `processing` stays `queued` while the AI job is running.
- `processing` becomes `ready` on success, or `failed` on terminal error.

A new optional column is added to `item_images`:

- `ai_metadata` (jsonb, nullable) — stores the prompt, model names, and generation timestamp.

## Backend changes

1. New server route `src/routes/api/generate-ortho.ts` (streaming is not needed here; we return a plain JSON result after the non-streaming image calls).
   - Read the reference image bytes from R2 using the server-side `aws4fetch` config.
   - Step 1: POST to `https://ai.gateway.lovable.dev/v1/images/edits` with `model: "openai/gpt-image-2"`, `prompt: "Top-down orthographic product view of this furniture on a pure white background, no shadows, centered, full item visible, professional furniture photography"`, and the image file part.
   - Step 2: POST to `/v1/images/edits` with `model: "openai/gpt-image-1-mini"`, `background: "transparent"`, and the step-1 output as the image file, prompting to remove the background while keeping the furniture exactly as-is.
   - Upload the final PNG bytes to R2 with a PUT + presigned URL (or server-side signed PUT).
   - Insert the `item_images` row and update the item status.

2. New admin review action in `src/routes/_authenticated/admin.tsx`:
   - When admin clicks "Confirm item", call the orthographic generation server route.
   - Show a loading state while processing.
   - On success, mark the item as approved with `processing: 'ready'`.

3. Background safety (per `ai-background-batch-jobs` rules):
   - The generation is triggered synchronously from the admin action, not from a scheduled job, so a single-flight lock and circuit-breaker pause state are not needed for this first version. We add a 30-second generation timeout guard and surface any `402`/`403` error directly to the admin.

## Frontend changes

- Item detail page (`items.$itemId.tsx`) shows the orthographic image when `processing = 'ready'`.
- Dashboard status badge shows "Processing" (yellow) while the ortho job runs, and "Ready" (green) when done.
- If generation fails, item status becomes `approved` + `processing: 'failed`, and a "Retry generation" button appears for admins and the item owner.

## Variants later

After the orthographic view is ready, the same pipeline can generate the smaller output sizes (thumb, card, hero) by resizing the final PNG, which does not require another AI call — only image resizing in the server function.
