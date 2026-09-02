// Cohort engine: rebuilds signup-cohort metrics and the identity quality per project from pseudonymous identity links.
// Runs from the daily sweep in an action that pages through links (≤ 2k per query) — never during page rendering.
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { lifecycleStage, identityQuality } from "./schema";
import { buildCohorts, identityQualityOf, IDENTITY_QUALITY_META, type IdentityQuality } from "./lib/identity";
import { DAY, dayKey } from "./lib/time";
import { requireOwnedSaas } from "./saas";
import { visibilityOf } from "./domain/visibility";

const PAGE = 2_000;
const MAX_SUBJECTS = 100_000;
const cohortRow = v.object({ cohort: v.string(), signedUp: v.number(), activated: v.number(), trial: v.number(), converted: v.number(), activatedD7: v.number(), convertedD30: v.number(), medianTimeToActivationMs: v.optional(v.number()), medianTimeToConversionMs: v.optional(v.number()) });

export const projectsWithLinks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Id<"saas">[] = [];
    for (const s of await ctx.db.query("saas").collect()) {
      if (s.isDemo) continue;
      const any = await ctx.db.query("identityLinks").withIndex("by_saas_subject", (q) => q.eq("saasId", s._id)).first();
      if (any || s.identityQuality) out.push(s._id);
    }
    return out;
  },
});

export const pageLinks = internalQuery({
  args: { saasId: v.id("saas"), stage: lifecycleStage, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { saasId, stage, cursor }) => {
    const page = await ctx.db.query("identityLinks").withIndex("by_saas_stage_at", (q) => q.eq("saasId", saasId).eq("stage", stage)).order("desc").paginate({ cursor, numItems: PAGE });
    return { items: page.page.map((l) => [l.subject, l.at] as const), cursor: page.isDone ? null : page.continueCursor };
  },
});

export const signupsInPeriod = internalQuery({
  args: { saasId: v.id("saas"), days: v.number() },
  handler: async (ctx, { saasId, days }) => {
    const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).gte("day", dayKey(Date.now() - days * DAY))).collect();
    return rows.reduce((a, r) => a + Math.max(0, r.newUsers), 0);
  },
});

async function loadStage(ctx: { runQuery: (...args: never[]) => Promise<unknown> }, saasId: Id<"saas">, stage: "signed_up" | "activated" | "trial" | "converted") {
  const map = new Map<string, number>();
  let cursor: string | null = null;
  while (map.size < MAX_SUBJECTS) {
    const res = (await (ctx.runQuery as (...a: unknown[]) => Promise<{ items: (readonly [string, number])[]; cursor: string | null }>)(internal.cohorts.pageLinks, { saasId, stage, cursor })) as { items: (readonly [string, number])[]; cursor: string | null };
    for (const [subject, at] of res.items) if (!map.has(subject)) map.set(subject, at);
    if (!res.cursor) break;
    cursor = res.cursor;
  }
  return map;
}

export const rebuildAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids = await ctx.runQuery(internal.cohorts.projectsWithLinks, {});
    for (const [i, saasId] of ids.entries()) await ctx.scheduler.runAfter(i * 2_000, internal.cohorts.rebuild, { saasId });
  },
});

export const rebuild = internalAction({
  args: { saasId: v.id("saas") },
  handler: async (ctx, { saasId }) => {
    const signups = await loadStage(ctx, saasId, "signed_up");
    const activated = await loadStage(ctx, saasId, "activated");
    const trial = await loadStage(ctx, saasId, "trial");
    const converted = await loadStage(ctx, saasId, "converted");
    const period = 90;
    const since = Date.now() - period * DAY;
    const signupLinks = [...signups.values()].filter((at) => at >= since).length;
    const signupsInPeriod = await ctx.runQuery(internal.cohorts.signupsInPeriod, { saasId, days: period });
    const downstream = [activated, converted].filter((m) => m.size > 0);
    const downstreamLinks = downstream.reduce((a, m) => a + m.size, 0);
    const downstreamMatched = downstream.reduce((a, m) => a + [...m.keys()].filter((k) => signups.has(k)).length, 0);
    const quality = identityQualityOf({ signupLinks, signupsInPeriod, downstreamLinks, downstreamMatched });
    const cohorts = buildCohorts(signups, { activated, trial, converted }).slice(-24);
    await ctx.runMutation(internal.cohorts.write, { saasId, cohorts, quality: quality.quality, coveragePct: quality.coveragePct });
  },
});

export const write = internalMutation({
  args: { saasId: v.id("saas"), cohorts: v.array(cohortRow), quality: identityQuality, coveragePct: v.number() },
  handler: async (ctx, { saasId, cohorts, quality, coveragePct }) => {
    const now = Date.now();
    const existing = await ctx.db.query("cohortMetrics").withIndex("by_saas_cohort", (q) => q.eq("saasId", saasId)).collect();
    const byKey = new Map(existing.map((r) => [r.cohort, r]));
    for (const c of cohorts) {
      const row = byKey.get(c.cohort);
      if (row) { await ctx.db.patch(row._id, { ...c, computedAt: now }); byKey.delete(c.cohort); }
      else await ctx.db.insert("cohortMetrics", { saasId, ...c, computedAt: now });
    }
    for (const stale of byKey.values()) await ctx.db.delete(stale._id);
    await ctx.db.patch(saasId, { identityQuality: quality, identityCoveragePct: coveragePct });
  },
});

// Deletes every identity link of one stage in bounded batches (used when a stage's source is replaced or removed).
export const purgeStage = internalMutation({
  args: { saasId: v.id("saas"), stage: lifecycleStage },
  handler: async (ctx, { saasId, stage }) => {
    const rows = await ctx.db.query("identityLinks").withIndex("by_saas_stage_at", (q) => q.eq("saasId", saasId).eq("stage", stage)).take(1_000);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length === 1_000) await ctx.scheduler.runAfter(0, internal.cohorts.purgeStage, { saasId, stage });
    else await ctx.scheduler.runAfter(0, internal.cohorts.rebuild, { saasId });
  },
});

export function cohortView(rows: { cohort: string; signedUp: number; activated: number; trial: number; converted: number; activatedD7: number; convertedD30: number; medianTimeToActivationMs?: number; medianTimeToConversionMs?: number; computedAt: number }[], quality: IdentityQuality, opts: { includeConversion: boolean; includeTrial: boolean; hideCounts: boolean }) {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : undefined);
  return {
    identityQuality: quality,
    label: IDENTITY_QUALITY_META[quality].label,
    explanation: IDENTITY_QUALITY_META[quality].blurb,
    basis: "cohort" as const,
    cohorts: rows.map((r) => ({
      cohort: r.cohort,
      signedUp: opts.hideCounts ? null : r.signedUp,
      activated: opts.hideCounts ? null : r.activated,
      activationPct: pct(r.activated, r.signedUp),
      activatedD7Pct: pct(r.activatedD7, r.signedUp),
      trial: opts.includeTrial ? (opts.hideCounts ? null : r.trial) : undefined,
      trialPct: opts.includeTrial ? pct(r.trial, r.signedUp) : undefined,
      converted: opts.includeConversion ? (opts.hideCounts ? null : r.converted) : undefined,
      convertedPct: opts.includeConversion ? pct(r.converted, r.signedUp) : undefined,
      convertedD30Pct: opts.includeConversion ? pct(r.convertedD30, r.signedUp) : undefined,
      trialToConvertedPct: opts.includeConversion && opts.includeTrial ? pct(r.converted, r.trial) : undefined,
      medianTimeToActivationMs: r.medianTimeToActivationMs,
      medianTimeToConversionMs: opts.includeConversion ? r.medianTimeToConversionMs : undefined,
      computedAt: r.computedAt,
    })),
  };
}

export const mine = query({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    const rows = await ctx.db.query("cohortMetrics").withIndex("by_saas_cohort", (q) => q.eq("saasId", id)).collect();
    return { ...cohortView(rows, saas.identityQuality ?? "aggregate_only", { includeConversion: true, includeTrial: true, hideCounts: false }), coveragePct: saas.identityCoveragePct };
  },
});

export const publicCohorts = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const vis = visibilityOf(s);
    const rows = await ctx.db.query("cohortMetrics").withIndex("by_saas_cohort", (q) => q.eq("saasId", s._id)).collect();
    return cohortView(rows, s.identityQuality ?? "aggregate_only", { includeConversion: vis.conversionRate || vis.convertedCount, includeTrial: vis.trialConversion, hideCounts: !vis.convertedCount });
  },
});
