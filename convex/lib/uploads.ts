// Shared rules for founder-supplied images (project logo, profile avatar): small raster files only, SVG is refused
// because it can carry script. Used by the upload mutations and by the importers that pull an icon from a website / X.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const IMAGE_MAX_BYTES = 1_048_576;
export const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const IMAGE_RULE = "PNG, JPG or WebP file up to 1 MB";

// Validates an upload and turns it into a served URL. A refused upload cannot be deleted here (the throw rolls the
// mutation back); the client validates first, so orphans are rare.
export async function storedImageUrl(ctx: MutationCtx, storageId: Id<"_storage">, label: string, previous?: Id<"_storage">) {
  const meta = await ctx.db.system.get(storageId);
  if (!meta) throw new Error("Upload not found");
  if (meta.size > IMAGE_MAX_BYTES || !IMAGE_TYPES.has(meta.contentType ?? "")) throw new Error(`${label} must be a ${IMAGE_RULE}`);
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new Error("Upload not found");
  if (previous && previous !== storageId) await ctx.storage.delete(previous);
  return { url, storageId };
}
