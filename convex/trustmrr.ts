// "Import from TrustMRR" (IMPORT-1): one operator key (TRUSTMRR_API_KEY on the Convex deployment), founders never enter
// a key. Nothing is saved by the import itself — the form / MCP tool decides what to apply.
import { ConvexError, v } from "convex/values";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { action, internalMutation, internalQuery, query, type ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireProfile } from "./profiles";
import { RATE_LIMITS } from "./lib/rateLimits";
import { TrustmrrError, fetchStartup, mapTrustmrrStartup, parseTrustmrrRef, TRUSTMRR_SITE, type TrustmrrImport } from "./lib/trustmrr";
import { DOCS_SHAPE } from "./lib/trustmrr.fixtures";

const limiter = new RateLimiter(components.rateLimiter, RATE_LIMITS);
// TRUSTMRR_API_KEY=fixture serves the documented example offline (dev / screenshots only).
const FIXTURE_KEY = "fixture";

export const isConfigured = () => Boolean(process.env.TRUSTMRR_API_KEY);

export const status = query({
  args: {},
  handler: async () => ({ configured: isConfigured() }),
});

export const myProfileId = internalQuery({
  args: {},
  handler: async (ctx) => (await requireProfile(ctx)).profile._id,
});

// Per-founder budget first, then the shared budget of the operator key. Neither throws; the caller words the refusal.
export const takeSlot = internalMutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const mine = await limiter.limit(ctx, "trustmrrImport", { key: profileId });
    if (!mine.ok) return { ok: false as const, scope: "founder" as const, retryAfterMs: mine.retryAfter };
    const shared = await limiter.limit(ctx, "trustmrrGlobal", { key: "operator" });
    if (!shared.ok) return { ok: false as const, scope: "operator" as const, retryAfterMs: shared.retryAfter };
    return { ok: true as const, retryAfterMs: 0 };
  },
});

export async function importForProfile(ctx: ActionCtx, profileId: Id<"profiles">, urlOrSlug: string): Promise<TrustmrrImport> {
  const key = process.env.TRUSTMRR_API_KEY;
  if (!key) throw new TrustmrrError("not_configured", "TrustMRR import is not configured on this deployment (TRUSTMRR_API_KEY)");
  const slug = parseTrustmrrRef(urlOrSlug);
  if (!slug) throw new TrustmrrError("bad_request", "Enter a TrustMRR startup URL (trustmrr.com/startup/<slug>) or the slug itself");
  const slot = await ctx.runMutation(internal.trustmrr.takeSlot, { profileId });
  if (!slot.ok) {
    const sec = Math.max(1, Math.ceil(slot.retryAfterMs / 1000));
    throw new TrustmrrError("rate_limited", slot.scope === "founder" ? `Import limit reached (5 per 10 minutes); try again in ${Math.ceil(sec / 60)} min` : "TrustMRR rate limit, try again in a minute", sec);
  }
  if (key === FIXTURE_KEY) {
    if (slug !== DOCS_SHAPE.data.slug) throw new TrustmrrError("not_found", `No startup "${slug}" on TrustMRR — check the URL`);
    const { prefill, unmapped } = mapTrustmrrStartup(DOCS_SHAPE);
    return { prefill, unmapped, source: { slug, url: `${TRUSTMRR_SITE}/startup/${slug}` } };
  }
  return fetchStartup(slug, key);
}

// Founder path (the new / edit project forms). Errors carry { code, message } so the UI can show them in production.
export const importStartup = action({
  args: { urlOrSlug: v.string() },
  handler: async (ctx, { urlOrSlug }): Promise<TrustmrrImport> => {
    const profileId = await ctx.runQuery(internal.trustmrr.myProfileId, {});
    try {
      return await importForProfile(ctx, profileId, urlOrSlug);
    } catch (e) {
      if (e instanceof TrustmrrError) throw new ConvexError({ code: e.code, message: e.message, retryAfterSec: e.retryAfterSec });
      throw e;
    }
  },
});
