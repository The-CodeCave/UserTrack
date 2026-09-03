import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (s: string | undefined, n: number) => (s ? s.slice(0, n) : undefined);

export const join = mutation({
  args: {
    email: v.string(),
    source: v.optional(v.string()),
    referrer: v.optional(v.string()),
    device: v.optional(v.union(v.literal("mobile"), v.literal("desktop"))),
    hp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.hp) return { ok: true as const, already: false };
    if (JSON.stringify(args).length > 2048) return { ok: false as const, error: "Request too large." };
    const email = args.email.trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false as const, error: "Please enter a valid email address." };
    const existing = await ctx.db.query("waitlist").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (existing) return { ok: true as const, already: true };
    const now = Date.now();
    await ctx.db.insert("waitlist", {
      email,
      createdAt: now,
      consentAt: now,
      source: clip(args.source, 64),
      referrer: clip(args.referrer, 128),
      userAgentFamily: args.device,
    });
    return { ok: true as const, already: false };
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("waitlist").collect()).length,
});

export const exportAll = internalQuery({
  args: { paginationOpts: v.optional(paginationOptsValidator) },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query("waitlist").order("asc").paginate(paginationOpts ?? { numItems: 500, cursor: null });
    return {
      ...page,
      page: page.page.map((r) => ({ email: r.email, createdAt: new Date(r.createdAt).toISOString(), source: r.source, referrer: r.referrer, device: r.userAgentFamily })),
    };
  },
});

export const remove = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const row = await ctx.db.query("waitlist").withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase())).first();
    if (!row) return { removed: false };
    await ctx.db.delete(row._id);
    return { removed: true };
  },
});
