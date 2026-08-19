export const CATEGORIES = [
  "seating",
  "tables",
  "storage",
  "beds",
  "lighting",
  "outdoor",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Output formats the processing pipeline produces for every uploaded item. */
export const IMAGE_VARIANTS = [
  { id: "thumb", label: "Thumbnail", size: "256 × 256", note: "Grid + search results" },
  { id: "card", label: "Card", size: "800 × 800", note: "Catalogue listing" },
  { id: "hero", label: "Hero", size: "1600 × 1600", note: "Product detail page" },
  { id: "ortho", label: "Orthographic", size: "2048 × 2048", note: "Front view, background removed" },
] as const;

export const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};

export const PROCESSING_LABEL: Record<string, string> = {
  awaiting_upload: "Awaiting upload",
  queued: "Queued for processing",
  processing: "Processing",
  ready: "Renders ready",
  failed: "Processing failed",
};

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function lastMonths(count: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en", {
    month: "short",
  });
}
