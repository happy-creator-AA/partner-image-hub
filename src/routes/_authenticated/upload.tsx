import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createUploadTargets, getStorageStatus } from "@/lib/uploads.functions";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CATEGORIES, IMAGE_VARIANTS } from "@/lib/catalog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Upload an image pack — Atelier Partners" },
      {
        name: "description",
        content:
          "Upload a furniture image pack plus a reference photo. We resize every variation and generate an orthographic view on a clean background.",
      },
      { property: "og:title", content: "Upload an image pack — Atelier Partners" },
      {
        property: "og:description",
        content: "Send your furniture images to Cloudflare storage and queue them for render processing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const signTargets = useServerFn(createUploadTargets);
  const storage = useQuery({ queryKey: ["storage-status"], queryFn: () => getStorageStatus() });

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("seating");
  const [sku, setSku] = useState("");
  const [material, setMaterial] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [description, setDescription] = useState("");
  const [pack, setPack] = useState<File[]>([]);
  const [reference, setReference] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pack.length === 0) {
      toast.error("Add at least one image to the pack.");
      return;
    }
    if (!reference) {
      toast.error("Add the 2nd reference image used for the orthographic view.");
      return;
    }

    setBusy(true);
    setProgress(5);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session expired, please sign in again.");

      const { data: item, error: itemError } = await supabase
        .from("items")
        .insert({
          partner_id: userId,
          title,
          category,
          sku: sku || null,
          material: material || null,
          dimensions: dimensions || null,
          description: description || null,
        })
        .select("id")
        .single();
      if (itemError) throw itemError;

      const files = [
        ...pack.map((f) => ({ file: f, kind: "source" as const })),
        { file: reference, kind: "reference" as const },
      ];

      const { targets } = await signTargets({
        data: {
          itemId: item.id,
          files: files.map((f) => ({
            name: f.file.name,
            contentType: f.file.type || "application/octet-stream",
            kind: f.kind,
          })),
        },
      });

      let done = 0;
      for (let i = 0; i < files.length; i++) {
        const entry = files[i]!;
        const target = targets[i]!;
        const res = await fetch(target.uploadUrl, {
          method: "PUT",
          body: entry.file,
          headers: { "content-type": entry.file.type || "application/octet-stream" },
        });
        if (!res.ok) throw new Error(`Upload failed for ${entry.file.name}`);

        const { error: imgError } = await supabase.from("item_images").insert({
          item_id: item.id,
          partner_id: userId,
          kind: entry.kind,
          variant: "original",
          storage_key: target.key,
          public_url: target.publicUrl,
          file_name: entry.file.name,
          content_type: entry.file.type,
          size_bytes: entry.file.size,
        });
        if (imgError) throw imgError;

        done += 1;
        setProgress(5 + Math.round((done / files.length) * 90));
      }

      await supabase.from("items").update({ processing: "queued" }).eq("id", item.id);
      setProgress(100);
      toast.success("Uploaded. Your item is queued for processing and admin review.");
      navigate({ to: "/items/$itemId", params: { itemId: item.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-eyebrow">New submission</p>
        <h1 className="mt-2 text-3xl">Upload an image pack</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Send every variation of the piece, plus a second reference image. Files go straight to Cloudflare
          storage and are then resized into the formats below and rendered as an orthographic view on an empty
          background.
        </p>

        {storage.data && !storage.data.configured ? (
          <div className="mt-6 rounded-lg border border-warning bg-warning/15 p-4 text-sm">
            Cloudflare storage credentials are not connected yet, so uploads will fail. Add your Cloudflare
            account ID, R2 access keys, bucket name and public bucket URL to enable uploading.
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-8 space-y-6">
          <div className="surface-panel space-y-5 p-6">
            <h2 className="text-lg">Item details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="material">Material</Label>
                <Input id="material" value={material} onChange={(e) => setMaterial(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="dimensions">Dimensions (W × D × H)</Label>
                <Input
                  id="dimensions"
                  value={dimensions}
                  placeholder="180 × 90 × 75 cm"
                  onChange={(e) => setDimensions(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  rows={3}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="surface-panel space-y-5 p-6">
            <h2 className="text-lg">Images</h2>
            <div className="space-y-1.5">
              <Label htmlFor="pack">Image pack (all variations of this item)</Label>
              <Input
                id="pack"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPack(Array.from(e.target.files ?? []))}
              />
              <p className="text-xs text-muted-foreground">{pack.length} file(s) selected</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference">2nd image — orthographic reference</Label>
              <Input
                id="reference"
                type="file"
                accept="image/*"
                onChange={(e) => setReference(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Used to generate the front orthographic view with an empty background.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-secondary/60 p-4">
              <p className="text-eyebrow">Generated formats</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {IMAGE_VARIANTS.map((v) => (
                  <li key={v.id} className="flex justify-between gap-4">
                    <span>
                      {v.label} <span className="text-muted-foreground">· {v.note}</span>
                    </span>
                    <span className="text-muted-foreground">{v.size}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {busy ? <Progress value={progress} /> : null}

          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? "Uploading…" : "Upload and submit for review"}
          </Button>
        </form>
      </main>
    </div>
  );
}
