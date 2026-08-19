import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requestSchema = z.object({
  itemId: z.string().uuid(),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        contentType: z.string().min(3).max(120),
        kind: z.enum(["source", "reference", "orthographic"]),
      }),
    )
    .min(1)
    .max(20),
});

export type UploadTarget = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  name: string;
  kind: "source" | "reference" | "orthographic";
};

/** Tells the UI whether Cloudflare R2 credentials are configured yet. */
export const getStorageStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readR2Config } = await import("./cloudflare.server");
  return { configured: readR2Config() !== null };
});

/** Signs direct-to-Cloudflare upload URLs for images belonging to the caller's item. */
export const createUploadTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ targets: UploadTarget[] }> => {
    const { readR2Config, presignPut, publicUrl, safeFileName } = await import("./cloudflare.server");

    const config = readR2Config();
    if (!config) {
      throw new Error("Cloudflare storage is not configured yet.");
    }

    const { data: item, error } = await context.supabase
      .from("items")
      .select("id, partner_id")
      .eq("id", data.itemId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!item || item.partner_id !== context.userId) {
      throw new Error("Item not found.");
    }

    const targets: UploadTarget[] = [];
    for (const file of data.files) {
      const key = `partners/${context.userId}/${data.itemId}/${file.kind}/${Date.now()}-${safeFileName(file.name)}`;
      targets.push({
        key,
        name: file.name,
        kind: file.kind,
        uploadUrl: await presignPut(config, key),
        publicUrl: publicUrl(config, key),
      });
    }

    return { targets };
  });
