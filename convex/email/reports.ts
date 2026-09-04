import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { getProfileForUser, requireProfile } from "../profiles";
import { enqueue } from "./send";
import { getPreferences } from "./prefs";
import { monthRange, monthlySummary, nextLocalHour, previousMonthKey, projectReport, type MonthlyPayload } from "../lib/emailRules";
import { visibilityOf } from "../domain/visibility";
import { failRun, recordPage, startRun } from "../jobs";

async function buildReport(ctx: MutationCtx, profile: Doc<"profiles">, period: string, now: number): Promise<MonthlyPayload | null> {
  const { firstDay, lastDayExclusive, start, end } = monthRange(period);
  const all = (await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", profile._id)).collect()).filter((s) => !s.isDemo);
  if (!all.length) return null;
  const projects = [];
  for (const s of all) {
    const before = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).lt("day", firstDay)).order("desc").first();
    const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", firstDay).lt("day", lastDayExclusive)).collect();
    const milestones = await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", s._id).gte("achievedAt", start).lt("achievedAt", end)).collect();
    // The owner's own report includes conversion even when it is private on the public page.
    projects.push(projectReport({ _id: s._id, name: s.name, slug: s.slug, isPublic: s.isPublic, totalUsers: s.totalUsers, activatedUsers: s.activatedUsers, convertedUsers: s.convertedUsers, signupToConvertedPct: s.signupToConvertedPct, trialToConvertedPct: s.trialToConvertedPct, conversionPublic: visibilityOf(s).conversionRate }, before, rows, milestones.map((m) => ({ title: m.title, achievedAt: m.achievedAt }))));
  }
  if (!projects.some((p) => p.hasData)) return null;
  projects.sort((a, b) => b.newUsers - a.newUsers);
  return monthlySummary(period, projects, now);
}

// 1st of the month: build one report per profile in pages of 50, deliver at 09:00 local time.
export const generateMonthly = internalMutation({
  args: { cursor: v.optional(v.string()), period: v.optional(v.string()), runId: v.optional(v.id("jobRuns")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const period = args.period ?? previousMonthKey(now);
    const runId = args.runId ?? (await startRun(ctx, "monthly growth report"));
    if (runId === null) return;
    try {
      const page = await ctx.db.query("profiles").paginate({ cursor: args.cursor ?? null, numItems: 50 });
      let created = 0;
      for (const p of page.page) {
        if (p.userId === "demo") continue;
        const exists = await ctx.db.query("monthlyReports").withIndex("by_profile_period", (q) => q.eq("profileId", p._id).eq("period", period)).unique();
        if (exists) continue;
        const payload = await buildReport(ctx, p, period, now);
        if (!payload) continue;
        const prefs = await getPreferences(ctx, p.userId);
        const deliverAt = nextLocalHour(now, prefs.timezone);
        const reportId = await ctx.db.insert("monthlyReports", { profileId: p._id, userId: p.userId, period, payload, deliverAt, createdAt: now });
        await ctx.scheduler.runAt(deliverAt, internal.email.reports.sendMonthly, { reportId });
        created++;
      }
      await recordPage(ctx, runId, { items: page.page.length, done: page.isDone });
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.email.reports.generateMonthly, { cursor: page.continueCursor, period, runId });
      else console.log(`monthly report ${period}: batch done, ${created} created in this page`);
    } catch (e) {
      await failRun(ctx, runId, "monthly growth report", e);
    }
  },
});

export const sendMonthly = internalMutation({
  args: { reportId: v.id("monthlyReports") },
  handler: async (ctx, { reportId }) => {
    const r = await ctx.db.get(reportId);
    if (!r || r.sentAt) return;
    const profile = await ctx.db.get(r.profileId);
    if (!profile) return;
    const res = await enqueue(ctx, { userId: r.userId, type: "monthly-report", dedupeKey: `monthly-report:${r.userId}:${r.period}`, data: { name: profile.displayName, report: r.payload as MonthlyPayload } });
    await ctx.db.patch(reportId, { sentAt: Date.now(), emailEventId: res.status === "queued" ? res.eventId : undefined });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return [];
    const rows = await ctx.db.query("monthlyReports").withIndex("by_profile_period", (q) => q.eq("profileId", profile._id)).order("desc").take(12);
    return rows.map((r) => ({ _id: r._id, period: r.period, payload: r.payload as MonthlyPayload, sentAt: r.sentAt, createdAt: r.createdAt }));
  },
});

export const getMine = query({
  args: { period: v.string() },
  handler: async (ctx, { period }) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return null;
    const r = await ctx.db.query("monthlyReports").withIndex("by_profile_period", (q) => q.eq("profileId", profile._id).eq("period", period)).unique();
    return r ? { _id: r._id, period: r.period, payload: r.payload as MonthlyPayload, sentAt: r.sentAt, createdAt: r.createdAt } : null;
  },
});

// Owner preview: builds (or rebuilds) last month's report in-app without emailing it.
export const previewMine = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    const now = Date.now();
    const period = previousMonthKey(now);
    const payload = await buildReport(ctx, profile, period, now);
    if (!payload) throw new Error("No data for last month yet — connect a data source first.");
    const exists = await ctx.db.query("monthlyReports").withIndex("by_profile_period", (q) => q.eq("profileId", profile._id).eq("period", period)).unique();
    if (exists) await ctx.db.patch(exists._id, { payload });
    else await ctx.db.insert("monthlyReports", { profileId: profile._id, userId: profile.userId, period, payload, deliverAt: now, createdAt: now, sentAt: now });
    return period;
  },
});
