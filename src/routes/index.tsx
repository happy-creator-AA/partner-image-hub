import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import heroChair from "@/assets/hero-chair.jpg";
import { IMAGE_VARIANTS } from "@/lib/catalog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atelier Partners — Furniture image portal" },
      {
        name: "description",
        content:
          "Partner portal for furniture brands: upload image packs, get every size format and an orthographic view on an empty background, then track approval and monthly stats.",
      },
      { property: "og:title", content: "Atelier Partners — Furniture image portal" },
      {
        property: "og:description",
        content:
          "Upload furniture image packs, receive catalogue-ready formats and orthographic renders, and follow approval status and monthly search stats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    n: "01",
    title: "Sign in as a partner",
    body: "Every brand gets its own workspace with a private catalogue of submissions.",
  },
  {
    n: "02",
    title: "Upload an image pack",
    body: "All variations of a piece go straight to Cloudflare storage from your browser — no size limits from a middle server.",
  },
  {
    n: "03",
    title: "We format and render",
    body: "Each image is produced in every catalogue size, and a second reference image drives an orthographic view on an empty background.",
  },
  {
    n: "04",
    title: "Track status and stats",
    body: "See when an admin confirms the item, and follow monthly views, clicks and searches per piece.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <AppHeader />

      <main>
        <section className="grain-hero border-b border-border">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-2">
            <div>
              <p className="text-eyebrow">Furniture brand partners</p>
              <h1 className="mt-4 text-5xl leading-[1.05]">
                Your pieces, catalogue-ready in one upload.
              </h1>
              <p className="mt-5 max-w-md text-muted-foreground">
                Send us your image pack. We produce every size variation and an orthographic view on an empty
                background, then keep you posted on approval and how often buyers find the piece.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link to="/auth">Sign in to upload</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/auth">Become a partner</Link>
                </Button>
              </div>
            </div>
            <img
              src={heroChair}
              alt="Terracotta bouclé armchair photographed on a seamless cream studio backdrop"
              width={1280}
              height={1024}
              className="rounded-xl border border-border object-cover shadow-[var(--shadow-lift)]"
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl">How it works</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <article key={s.n} className="surface-panel p-6">
                <span className="font-display text-2xl text-accent">{s.n}</span>
                <h3 className="mt-3 text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-secondary/50">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-3xl">What you get back per item</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {IMAGE_VARIANTS.map((v) => (
                <div key={v.id} className="surface-panel p-5">
                  <p className="text-eyebrow">{v.size}</p>
                  <h3 className="mt-2 text-lg">{v.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{v.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
          Atelier Partners — furniture image intake and catalogue operations.
        </footer>
      </main>
    </div>
  );
}
