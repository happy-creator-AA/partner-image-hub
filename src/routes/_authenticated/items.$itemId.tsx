import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { ProcessingBadge, StatusBadge } from "@/components/StatusBadge";
import { IMAGE_VARIANTS, lastMonths, monthKey, monthLabel } from "@/lib/catalog";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/items/$itemId")({
  head: () => ({
    meta: [
      { title: "Item status and stats — Atelier Partners" },
      {
        name: "description",
        content: "Review status, generated image formats and monthly views, clicks and searches for this furniture item.",
      },
      { property: "og:title", content: "Item status and stats — Atelier Partners" },
      { property: "og:description", content: "Follow approval status and monthly performance for a submitted item." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ItemDetail,
});

function ItemDetail() {
  const { itemId } = Route.useParams();

  const item = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const images = useQuery({
    queryKey: ["item-images", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("item_images")
        .select("*")
        .eq("item_id", itemId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["item-events", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("item_events")
        .select("event_type, created_at")
        .eq("item_id", itemId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const months = lastMonths(6);
  const chart = months.map((m) => {
    const rows = (events.data ?? []).filter((e) => monthKey(e.created_at) === m);
    return {
      month: monthLabel(m),
      views: rows.filter((r) => r.event_type === "view").length,
      clicks: rows.filter((r) => r.event_type === "click").length,
      searches: rows.filter((r) => r.event_type === "search").length,
    };
  });

  if (item.isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-5 py-10">
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!item.data) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-5 py-20 text-center">
          <h1 className="text-2xl">Item not found</h1>
          <Link to="/dashboard" className="mt-4 inline-block text-accent underline">
            Back to your catalogue
          </Link>
        </main>
      </div>
    );
  }

  const data = item.data;
  const sources = (images.data ?? []).filter((i) => i.kind === "source");
  const references = (images.data ?? []).filter((i) => i.kind === "reference");
  const orthos = (images.data ?? []).filter((i) => i.kind === "orthographic");

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to catalogue
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl">{data.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.category}
              {data.sku ? ` · ${data.sku}` : ""}
              {data.dimensions ? ` · ${data.dimensions}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={data.status} />
            <ProcessingBadge status={data.processing} />
          </div>
        </div>

        {data.admin_note ? (
          <div className="mt-6 rounded-lg border border-border bg-secondary p-4 text-sm">
            <p className="text-eyebrow">Admin note</p>
            <p className="mt-1">{data.admin_note}</p>
          </div>
        ) : null}

        <section className="mt-10">
          <h2 className="text-xl">Uploaded pack ({sources.length})</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {sources.map((img) => (
              <figure key={img.id} className="surface-panel overflow-hidden">
                <img
                  src={img.public_url ?? ""}
                  alt={img.file_name ?? data.title}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </figure>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-xl">Reference image</h2>
            {references[0]?.public_url ? (
              <img
                src={references[0].public_url}
                alt="Orthographic reference"
                loading="lazy"
                className="surface-panel mt-4 aspect-square w-full object-cover"
              />
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No reference uploaded.</p>
            )}
          </div>
          <div>
            <h2 className="text-xl">Orthographic view</h2>
            {orthos[0]?.public_url ? (
              <img
                src={orthos[0].public_url}
                alt="Orthographic view with empty background"
                loading="lazy"
                className="surface-panel mt-4 aspect-square w-full object-contain"
              />
            ) : (
              <div className="surface-panel mt-4 flex aspect-square items-center justify-center p-6 text-center text-sm text-muted-foreground">
                The orthographic render on an empty background appears here once processing finishes.
              </div>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl">Output formats</h2>
          <div className="surface-panel mt-4 divide-y divide-border">
            {IMAGE_VARIANTS.map((v) => {
              const ready = data.processing === "ready";
              return (
                <div key={v.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                  <div>
                    <p className="font-medium">{v.label}</p>
                    <p className="text-muted-foreground">{v.note}</p>
                  </div>
                  <div className="text-right text-muted-foreground">
                    <div>{v.size}</div>
                    <div>{ready ? "Ready" : "Pending"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl">Monthly performance</h2>
          <div className="surface-panel mt-4 p-5">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="var(--color-muted-foreground)" fontSize={12} />
                  <RechartsTooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="views" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="clicks" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="searches" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
