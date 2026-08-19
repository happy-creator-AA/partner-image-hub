# Batch upload: one spreadsheet + one image folder

Today the upload page creates a single item at a time. This replaces it with a bulk flow: a partner drops one Excel item list (up to 100 rows) plus a folder of images (50–100+), the app matches images to items, and everything is created and uploaded in one pass.

## The flow

1. **Step 1 — Item list.** Partner drops an `.xlsx`/`.csv`. Expected columns: `title` (required), `sku`, `category`, `material`, `dimensions`, `description`, and `folder` (the image folder/name key; defaults to `sku`, else `title`). Header names are matched case-insensitively with common aliases. A downloadable template is offered on the page.
2. **Step 2 — Image folder.** Partner drops a folder (or a multi-file selection). Each image is assigned to an item by its containing folder name; loose files fall back to a filename prefix match against the folder key.
3. **Step 3 — Match review.** A table shows every spreadsheet row with its matched image count, a thumbnail strip, and the auto-picked orthographic reference (first image, changeable by clicking another thumbnail). Problems are flagged inline: rows with zero images, images that matched no row, duplicate keys, unsupported file types. Unmatched rows can be dropped, and any leftover images can be reassigned to a row from a dropdown.
4. **Step 4 — Submit.** Progress bar over all items and files; per-item status (uploaded / failed). On completion the partner lands on the dashboard with a summary toast. Failed items stay listed so they can be retried without redoing the whole batch.

## Notes

- Single-item upload stays available as a "Add one item" mode on the same page for partners with a one-off piece.
- No schema change is needed: each spreadsheet row becomes an `items` record and each image an `item_images` record, exactly as today. One image per item is stored with kind `reference` (the ortho source); the rest are `source`.
- Items are only created in the database once its own uploads succeed, so a failed batch doesn't leave empty items behind.

## Technical details

- Parse spreadsheets client-side with SheetJS (`xlsx`); CSV handled by the same parser.
- Folder drop uses `webkitdirectory` on the file input plus drag-and-drop `webkitGetAsEntry` traversal, so relative paths (`Chair-01/front.jpg`) are preserved for matching.
- `src/lib/uploads.functions.ts`: raise the per-request file cap from 20 to 200 and keep ownership checks; the client signs in chunks of ~50 files per item batch.
- Uploads run with a concurrency limit (6 parallel PUTs to R2) instead of the current sequential loop, with retry-once on network failure.
- New files: `src/lib/batch-manifest.ts` (spreadsheet parsing, column aliasing, matching logic — unit-testable, no React), `src/components/BatchMatchTable.tsx`, `src/components/BatchDropzone.tsx`.
- `src/routes/_authenticated/upload.tsx` becomes the batch wizard, reusing the existing metadata form for the single-item mode.
