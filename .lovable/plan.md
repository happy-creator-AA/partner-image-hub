# Batch intake by ZIP link

Instead of dragging 50–100 files, a partner submits a **pack**: one Excel/CSV manifest and one link to a ZIP of images. The server downloads the ZIP, unpacks it, matches images to manifest rows by folder name, and creates the items.

## Partner flow

1. Partner prepares a ZIP where each item has its own folder (`ANK-2201/`, `LOU-118/`, ...) containing that item's photos.
2. Partner uploads the ZIP anywhere that gives a direct download link (R2 public URL, Drive, Dropbox, WeTransfer).
3. On a new **New pack** page the partner:
   - uploads the manifest spreadsheet (name, category, dimensions, materials, folder name),
   - pastes the ZIP link,
   - submits.
4. The pack page shows live progress: Downloading → Unpacking → Matching → Uploading to storage → Ready for review.
5. When done, a match review table lists every row: item, number of images found, the auto-picked ortho reference (first image in the folder), and any problems (folder missing, no images, unreadable file). The partner can swap the ortho reference or re-submit a corrected link.
6. Admin reviews and confirms items exactly as today; the ortho/top-view render job uses the chosen reference image.

## Failure handling

- Bad/expired link, private file, non-ZIP content, or oversized archive → the pack fails with a plain-language reason and a retry field.
- Rows with no matching folder are marked unmatched, and the rest of the pack still imports.
- Duplicate folder names across a pack are flagged, not silently merged.

## What changes in the app

- Existing single-item upload stays available for one-offs.
- Dashboard gains a Packs list (pack name, item count, status, date) above the items list.

## Technical notes

- New tables: `packs` (partner, source ZIP URL, status, error, counts) and `pack_rows` (raw manifest row, matched folder, resulting `item_id`, per-row status), with RLS mirroring `items` (partner sees own, admin sees all) plus GRANTs.
- Manifest parsing happens client-side with `xlsx` so the partner sees column mapping and validation errors before submitting; parsed rows are sent as JSON.
- ZIP ingest runs in a server function: fetch the URL with a size cap and content-type check, unzip in memory with `fflate` (Worker-safe, no native deps), then PUT each image to R2 with the existing `aws4fetch` signing in `cloudflare.server.ts`. Large packs are processed in chunks, with progress written to `packs.status`/counters and polled by the UI via TanStack Query.
- Google Drive and Dropbox share links are normalised to their direct-download form before fetching.
- First image per folder (natural sort) is stored as `kind = 'reference'`; the rest as `kind = 'source'`. Ortho output rows are created as pending, unchanged from the current model.
