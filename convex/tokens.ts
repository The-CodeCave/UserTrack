// Developer credential management for the signed-in founder (dashboard + onboarding). Secrets are returned exactly once.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProfile } from "./profiles";
import { API_SCOPES, DEFAULT_MCP_SCOPES, generateSecret, isActive, maskToken, PLANS, planFor, sha256Hex, validScopes } from "./lib/tokens";
import { tokenType } from "./schema";
import { DAY, dayKey } from "./lib/time";

const MAX_ACTIVE = 25;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    const rows = await ctx.db.query("developerTokens").withIndex("by_profile", (q) => q.eq("profileId", profile._id)).collect();
    const since = dayKey(Date.now() - 7 * DAY);
    const out = [];
    for (const t of rows.sort((a, b) => b.createdAt - a.createdAt)) {
      const usage = await ctx.db.query("apiUsage").withIndex("by_token_day", (q) => q.eq("tokenId", t._id).gte("day", since)).collect();
      const today = dayKey(Date.now());
      out.push({
        id: t._id,
        type: t.type,
        name: t.name,
        prefix: t.prefix,
        masked: maskToken(t.prefix),
        scopes: t.scopes,
        origin: t.origin ?? "settings",
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        revokedAt: t.revokedAt,
        expiresAt: t.expiresAt,
        active: isActive(t),
        usage: { today: usage.filter((u) => u.day === today).reduce((a, u) => a + u.count, 0), last7d: usage.reduce((a, u) => a + u.count, 0), perDay: PLANS[planFor()][t.type].perDay },
      });
    }
    return out;
  },
});

export const create = mutation({
  args: { type: tokenType, name: v.string(), scopes: v.optional(v.array(v.string())), expiresInDays: v.optional(v.number()), origin: v.optional(v.union(v.literal("settings"), v.literal("onboarding"))) },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const name = args.name.trim().slice(0, 60);
    if (name.length < 1) throw new Error("Give the token a name");
    const scopes = args.type === "api" ? API_SCOPES : (args.scopes?.length ? args.scopes : DEFAULT_MCP_SCOPES);
    if (!validScopes(scopes)) throw new Error("Unknown scope");
    const existing = await ctx.db.query("developerTokens").withIndex("by_profile", (q) => q.eq("profileId", profile._id)).collect();
    if (existing.filter((t) => isActive(t)).length >= MAX_ACTIVE) throw new Error(`You can have at most ${MAX_ACTIVE} active tokens`);
    const { secret, prefix } = generateSecret(args.type);
    const now = Date.now();
    const id = await ctx.db.insert("developerTokens", {
      profileId: profile._id,
      type: args.type,
      name,
      prefix,
      hash: sha256Hex(secret),
      scopes: [...scopes],
      origin: args.origin ?? "settings",
      createdAt: now,
      expiresAt: args.expiresInDays && args.expiresInDays > 0 ? now + Math.min(args.expiresInDays, 365) * DAY : undefined,
    });
    await ctx.db.insert("auditLogs", { profileId: profile._id, tokenId: id, action: args.type === "mcp" ? "mcp_token_created" : "api_key_created", ok: true, detail: args.origin ?? "settings", at: now });
    return { id, secret, prefix, scopes, type: args.type };
  },
});

export const revoke = mutation({
  args: { id: v.id("developerTokens") },
  handler: async (ctx, { id }) => {
    const { profile } = await requireProfile(ctx);
    const t = await ctx.db.get(id);
    if (!t || t.profileId !== profile._id) throw new Error("Token not found");
    if (t.revokedAt) return;
    await ctx.db.patch(id, { revokedAt: Date.now() });
    await ctx.db.insert("auditLogs", { profileId: profile._id, tokenId: id, action: "token_revoked", ok: true, at: Date.now() });
  },
});

// Recent token-authenticated actions for the developer dashboard. Never includes configs or secrets by construction.
export const activity = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    const rows = await ctx.db.query("auditLogs").withIndex("by_profile_time", (q) => q.eq("profileId", profile._id)).order("desc").take(50);
    const out = [];
    for (const r of rows) {
      const token = r.tokenId ? await ctx.db.get(r.tokenId) : null;
      const saas = r.saasId ? await ctx.db.get(r.saasId) : null;
      out.push({ id: r._id, action: r.action, ok: r.ok, detail: r.detail, at: r.at, token: token ? { name: token.name, prefix: token.prefix, type: token.type } : null, project: saas ? { name: saas.name, slug: saas.slug } : null });
    }
    return out;
  },
});
