import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { readR2Config } from "@/lib/cloudflare.server";
import {
  fetchImageBytes,
  generateOrthographicImage,
  uploadBytesToR2,
} from "@/lib/ortho.server";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const Route = createFileRoute("/api/generate-ortho")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          return new Response("Server misconfiguration", { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.replace("Bearer ", "");

        const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        });

        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        if (claimsError || !claims?.claims.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub;

        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (!isAdmin) {
          return new Response("Forbidden", { status: 403 });
        }

        let body: { itemId?: string };
        try {
          body = (await request.json()) as { itemId?: string };
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        const itemId = body.itemId;
        if (!itemId) {
          return new Response("Missing itemId", { status: 400 });
        }

        // Lock the item into processing state and fetch its reference image.
        const { data: item, error: itemError } = await supabase
          .from("items")
          .select("id, partner_id, processing")
          .eq("id", itemId)
          .maybeSingle();
        if (itemError || !item) {
          return new Response("Item not found", { status: 404 });
        }

        if (item.processing === "processing") {
          return Response.json({ ok: true, message: "Already processing" });
        }

        const { data: existingOrtho } = await supabase
          .from("item_images")
          .select("id")
          .eq("item_id", itemId)
          .eq("kind", "orthographic")
          .maybeSingle();
        if (existingOrtho) {
          return Response.json({ ok: true, message: "Orthographic view already exists" });
        }

        const { data: reference, error: refError } = await supabase
          .from("item_images")
          .select("public_url, file_name, content_type")
          .eq("item_id", itemId)
          .eq("kind", "reference")
          .order("created_at", { ascending: true })
          .maybeSingle();
        if (refError || !reference?.public_url) {
          return Response.json({ ok: false, error: "No reference image found for this item." }, { status: 400 });
        }

        const { error: lockError } = await supabase
          .from("items")
          .update({ processing: "processing" })
          .eq("id", itemId);
        if (lockError) {
          return Response.json({ ok: false, error: lockError.message }, { status: 500 });
        }

        const config = readR2Config();
        if (!config) {
          await supabase.from("items").update({ processing: "failed" }).eq("id", itemId);
          return Response.json({ ok: false, error: "Cloudflare storage is not configured." }, { status: 500 });
        }

        const referenceBytes = await fetchImageBytes(reference.public_url);
        if (!referenceBytes) {
          await supabase.from("items").update({ processing: "failed" }).eq("id", itemId);
          return Response.json({ ok: false, error: "Could not fetch reference image from storage." }, { status: 500 });
        }

        const generated = await generateOrthographicImage({
          referenceBytes,
          referenceName: reference.file_name ?? "reference.png",
        });
        if ("error" in generated) {
          await supabase.from("items").update({ processing: "failed" }).eq("id", itemId);
          return Response.json({ ok: false, error: generated.error, terminal: generated.terminal }, { status: 500 });
        }

        const key = `items/${itemId}/orthographic.png`;
        let publicUrl: string;
        try {
          publicUrl = await uploadBytesToR2(config, key, generated.bytes, "image/png");
        } catch (e) {
          await supabase.from("items").update({ processing: "failed" }).eq("id", itemId);
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
        }

        const { data: inserted, error: insertError } = await supabase
          .from("item_images")
          .insert({
            item_id: itemId,
            partner_id: item.partner_id,
            kind: "orthographic",
            variant: "orthographic",
            storage_key: key,
            public_url: publicUrl,
            file_name: "orthographic.png",
            content_type: "image/png",
            size_bytes: generated.bytes.length,
            ai_metadata: {
              step1_model: "openai/gpt-image-2",
              step2_model: "openai/gpt-image-1-mini",
              step1_prompt: "Top-down orthographic product view of this furniture.",
              step2_prompt: "Remove the background completely and keep only the furniture.",
              generated_at: new Date().toISOString(),
            },
          })
          .select("id")
          .single();
        if (insertError) {
          await supabase.from("items").update({ processing: "failed" }).eq("id", itemId);
          return Response.json({ ok: false, error: insertError.message }, { status: 500 });
        }

        const { error: updateError } = await supabase
          .from("items")
          .update({ processing: "ready" })
          .eq("id", itemId);
        if (updateError) {
          return Response.json({ ok: false, error: updateError.message }, { status: 500 });
        }

        return Response.json({ ok: true, orthoImageId: inserted.id, publicUrl });
      },
    },
  },
});
