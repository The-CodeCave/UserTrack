import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { gatewayMatches } from "./lib/gateway";

// Referrer host → lowercase, no port, no leading www. Anything that does not look like a hostname is dropped.
export function normalizeHost(raw: string | null | undefined) {
  if (!raw) return null;
  let h = raw.trim().toLowerCase();
  try { if (h.includes("://")) h = new URL(h).hostname; } catch { return null; }
  h = h.replace(/:\d+$/, "").replace(/^www\./, "");
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h) && h.length <= 253 ? h : null;
}

// Called by /embed/[slug] after the response is sent. Gateway secret keeps the mutation private to the Next.js process.
export const record = mutation({
  args: { gateway: v.optional(v.string()), slug: v.string(), host: v.string() },
  handler: async (ctx, { gateway, slug, host }) => {
    if (!gatewayMatches(gateway)) return { ok: false as const };
    const h = normalizeHost(host);
    if (!h) return { ok: false as const };
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return { ok: false as const };
    const now = Date.now();
    const row = await ctx.db.query("embedSites").withIndex("by_saas_host", (q) => q.eq("saasId", s._id).eq("host", h)).unique();
    if (row) {
      await ctx.db.patch(row._id, { loads: row.loads + 1, lastSeenAt: now });
    } else {
      await ctx.db.insert("embedSites", { saasId: s._id, host: h, loads: 1, firstSeenAt: now, lastSeenAt: now });
      await ctx.db.patch(s._id, { embedSiteCount: (s.embedSiteCount ?? 0) + 1 });
    }
    return { ok: true as const, host: h };
  },
});
