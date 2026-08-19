import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { useIsAdmin } from "@/hooks/useSession";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Review queue — Atelier Partners" },
      {
        name: "description",
        content: "Admin review queue: confirm or reject partner furniture submissions and their generated renders.",
      },
      { property: "og:title", content: "Review queue — Atelier Partners" },
      { property: "og:description", content: "Confirm or reject partner furniture submissions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const items = useQuery({
    queryKey: ["admin-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, title, category, sku, status, processing, created_at, partner_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const images = useQuery({
    queryKey: ["admin-images"],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_images").select("item_id, public_url, kind");
      if (error) throw error;
      return data ?? [];
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      // Save the review decision first.
      const { error } = await supabase
        .from("items")
        .update({
          status,
          admin_note: notes[id] ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;

      if (status === "approved") {
        // Kick off the orthographic/top-view generation in the background.
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        const res = await fetch("/api/generate-ortho", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({ itemId: id }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
          throw new Error(body.error ?? `Generation failed (${res.status})`);
        }
      }
    },
    onSuccess: () => {
      toast.success("Review saved.");
      queryClient.invalidateQueries({ queryKey: ["admin-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h1 className="text-2xl">Admin access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This review queue is only available to catalogue administrators.
          </p>
          <Link to="/dashboard" className="mt-4 inline-block text-accent underline">
            Back to your catalogue
          </Link>
        </main>
      </div>
    );
  }

  const list = items.data ?? [];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-eyebrow">Administration</p>
        <h1 className="mt-2 text-3xl">Review queue</h1>

        <div className="mt-8 space-y-4">
          {items.isLoading ? <Skeleton className="h-40 w-full" /> : null}
          {list.map((item) => {
            const thumbs = (images.data ?? []).filter((i) => i.item_id === item.id);
            return (
              <div key={item.id} className="surface-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl">{item.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {item.category}
                      {item.sku ? ` · ${item.sku}` : ""} · submitted{" "}
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {thumbs.slice(0, 6).map((img, idx) => (
                    <img
                      key={`${img.item_id}-${idx}`}
                      src={img.public_url ?? ""}
                      alt={`${item.title} ${img.kind}`}
                      loading="lazy"
                      className="size-24 rounded-md border border-border object-cover"
                    />
                  ))}
                </div>

                <Textarea
                  className="mt-4"
                  rows={2}
                  placeholder="Note for the partner (optional)"
                  value={notes[item.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                />

                <div className="mt-4 flex gap-3">
                  <Button
                    onClick={() => review.mutate({ id: item.id, status: "approved" })}
                    disabled={review.isPending}
                  >
                    Confirm item
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => review.mutate({ id: item.id, status: "rejected" })}
                    disabled={review.isPending}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
