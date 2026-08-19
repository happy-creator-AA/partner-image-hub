import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  itemId: z.string().uuid(),
  eventType: z.enum(["view", "click", "search"]),
});

/** Public tracking endpoint: records a view/click/search against a published item. */
export const recordItemEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item } = await supabaseAdmin
      .from("items")
      .select("id, status")
      .eq("id", data.itemId)
      .maybeSingle();

    if (!item || item.status !== "approved") return { recorded: false };

    await supabaseAdmin.from("item_events").insert({
      item_id: data.itemId,
      event_type: data.eventType,
    });

    return { recorded: true };
  });
