import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { ProcessingBadge, StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My furniture items — Atelier Partners" },
      {
        name: "description",
        content: "Track review status, generated renders and monthly performance of every furniture item you submitted.",
      },
      { property: "og:title", content: "My furniture items — Atelier Partners" },
      { property: "og:description", content: "Review status and monthly stats for your submitted furniture." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type ItemRow = {
  id: string;
  title: string;
  category: string;
  sku: string | null;
  status: string;
  processing: string;
  created_at: string;
};

function Dashboard() {
  const items = useQuery({
    queryKey: ["my-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, title, category, sku, status, processing, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const thumbs = useQuery({
    queryKey: ["my-thumbs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("item_images")
        .select("item_id, public_url, kind")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.public_url && !map.has(row.item_id)) map.set(row.item_id, row.public_url);
      }
      return map;
    },
  });

  const events = useQuery({
    queryKey: ["my-events-30"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data, error } = await supabase
        .from("item_events")
        .select("item_id, event_type")
        .gte("created_at", since);
      if (error) throw error;
      const map = new Map<string, { view: number; click: number; search: number }>();
      for (const row of data ?? []) {
        const entry = map.get(row.item_id) ?? { view: 0, click: 0, search: 0 };
        entry[row.event_type as "view" | "click" | "search"] += 1;
        map.set(row.item_id, entry);
      }
      return map;
    },
  });

  const list = items.data ?? [];
  const approved = list.filter((i) => i.status === "approved").length;
  const pending = list.filter((i) => i.status === "pending").length;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-eyebrow">Partner dashboard</p>
            <h1 className="mt-2 text-3xl">Your catalogue</h1>
          </div>
          <Button asChild>
            <Link to="/upload">Upload new item</Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Items submitted" value={list.length} />
          <Stat label="Approved" value={approved} />
          <Stat label="Awaiting review" value={pending} />
        </div>

        <div className="mt-10 space-y-3">
          {items.isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : list.length === 0 ? (
            <div className="surface-panel p-10 text-center">
              <h2 className="text-xl">No items yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload an image pack and a reference photo to get your first piece into the catalogue.
              </p>
              <Button asChild className="mt-5">
                <Link to="/upload">Start an upload</Link>
              </Button>
            </div>
          ) : (
            list.map((item) => {
              const stats = events.data?.get(item.id);
              return (
                <Link
                  key={item.id}
                  to="/items/$itemId"
                  params={{ itemId: item.id }}
                  className="surface-panel flex flex-wrap items-center gap-5 p-4 transition-shadow hover:shadow-[var(--shadow-lift)]"
                >
                  <div className="size-20 shrink-0 overflow-hidden rounded-md bg-muted">
                    {thumbs.data?.get(item.id) ? (
                      <img
                        src={thumbs.data.get(item.id)!}
                        alt={item.title}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-40 flex-1">
                    <h3 className="text-lg">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.category}
                      {item.sku ? ` · ${item.sku}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    <ProcessingBadge status={item.processing} />
                  </div>
                  <div className="w-40 text-right text-sm text-muted-foreground">
                    <div>{stats?.view ?? 0} views / 30d</div>
                    <div>{stats?.click ?? 0} clicks · {stats?.search ?? 0} searches</div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-panel p-5">
      <p className="text-eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}
