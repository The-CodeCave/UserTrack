// Data retention. Logs, counters and raw samples are swept daily; product data (accounts, projects, aggregates)
// is only ever removed by its owner (convex/account.ts). Periods live in src/lib/legal.ts, which is also what
// /privacy states. One step per table, paged with the take(batch) + reschedule pattern of native.pruneEvents.
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PAGE, failRun, recordPage, startRun } from "./jobs";
import { DAY, dayKey } from "./lib/time";
import { RETENTION_DAYS } from "../src/lib/legal";

// Rows deleted per transaction, and old snapshots read per product while thinning.
export const RETENTION_BATCH = 200;
export const THIN_SCAN = 400;

export const RETENTION_STEPS = ["syncRuns", "webhookDeliveries", "emailEvents", "apiUsage", "auditLogs", "oauthStates", "backfills", "jobRuns", "snapshots", "stageSnapshots"] as const;
export type RetentionStep = (typeof RETENTION_STEPS)[number];

export const RETENTION_POLICY: Record<RetentionStep, number> = {
  syncRuns: RETENTION_DAYS.syncRuns,
  webhookDeliveries: RETENTION_DAYS.webhookDeliveries,
  emailEvents: RETENTION_DAYS.emailLog,
  apiUsage: RETENTION_DAYS.apiUsage,
  auditLogs: RETENTION_DAYS.auditLogs,
  oauthStates: RETENTION_DAYS.oauthStates,
  backfills: RETENTION_DAYS.backfills,
  jobRuns: RETENTION_DAYS.jobRuns,
  snapshots: RETENTION_DAYS.snapshotsRawBeforeAggregation,
  stageSnapshots: RETENTION_DAYS.snapshotsRawBeforeAggregation,
};

// A delivery is only dropped once it can no longer be retried; pending / failed rows stay until the engine closes them.
const PURGEABLE_DELIVERY_STATUS = ["success", "exhausted"] as const;

type PurgeStep = Exclude<RetentionStep, "snapshots" | "stageSnapshots">;

async function expired(ctx: MutationCtx, step: PurgeStep, cutoff: number) {
  const n = RETENTION_BATCH;
  switch (step) {
    case "syncRuns":
      return (await ctx.db.query("syncRuns").withIndex("by_time", (q) => q.lt("startedAt", cutoff)).take(n)).map((r) => r._id);
    case "webhookDeliveries": {
      const ids: Id<"webhookDeliveries">[] = [];
      for (const status of PURGEABLE_DELIVERY_STATUS) {
        const rows = await ctx.db.query("webhookDeliveries").withIndex("by_status_created", (q) => q.eq("status", status).lt("createdAt", cutoff)).take(n);
        ids.push(...rows.map((r) => r._id));
      }
      return ids;
    }
    case "emailEvents":
      return (await ctx.db.query("emailEvents").withIndex("by_created", (q) => q.lt("createdAt", cutoff)).take(n)).map((r) => r._id);
    case "apiUsage":
      return (await ctx.db.query("apiUsage").withIndex("by_day", (q) => q.lt("day", dayKey(cutoff))).take(n)).map((r) => r._id);
    case "auditLogs":
      return (await ctx.db.query("auditLogs").withIndex("by_time", (q) => q.lt("at", cutoff)).take(n)).map((r) => r._id);
    case "oauthStates":
      return (await ctx.db.query("oauthStates").withIndex("by_created", (q) => q.lt("createdAt", cutoff)).take(n)).map((r) => r._id);
    case "backfills":
      return (await ctx.db.query("backfills").withIndex("by_time", (q) => q.lt("startedAt", cutoff)).take(n)).map((r) => r._id);
    case "jobRuns":
      return (await ctx.db.query("jobRuns").withIndex("by_time", (q) => q.lt("startedAt", cutoff)).take(n)).map((r) => r._id);
  }
}

async function purge(ctx: MutationCtx, step: PurgeStep, cutoff: number) {
  const ids = await expired(ctx, step, cutoff);
  for (const id of ids) await ctx.db.delete(id);
  return { items: ids.length, more: ids.length >= RETENTION_BATCH, cursor: undefined };
}

// Old raw samples are thinned to the last row of each UTC day (per stage for stageSnapshots), one page of products
// per transaction. Rows are read oldest first and only ever deleted in favour of a later row of the same day, so a
// product with more than THIN_SCAN expired rows simply finishes on one of the next sweeps.
async function thin(ctx: MutationCtx, step: "snapshots" | "stageSnapshots", cutoff: number, cursor: string | undefined) {
  const page = await ctx.db.query("saas").paginate({ cursor: cursor ?? null, numItems: PAGE.retention });
  let items = 0;
  for (const s of page.page) {
    const rows = step === "snapshots"
      ? await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", s._id).lt("capturedAt", cutoff)).take(THIN_SCAN)
      : await ctx.db.query("stageSnapshots").withIndex("by_saas_captured", (q) => q.eq("saasId", s._id).lt("capturedAt", cutoff)).take(THIN_SCAN);
    const last = new Map<string, Id<"snapshots"> | Id<"stageSnapshots">>();
    for (const row of rows) {
      const key = "stage" in row ? `${dayKey(row.capturedAt)}:${row.stage}` : dayKey(row.capturedAt);
      const previous = last.get(key);
      if (previous) {
        await ctx.db.delete(previous);
        items++;
      }
      last.set(key, row._id);
    }
  }
  return { items, more: !page.isDone, cursor: page.continueCursor };
}

// One step (and one page of it) per transaction, chained through the scheduler from the daily sweep.
export const sweep = internalMutation({
  args: { step: v.optional(v.number()), cursor: v.optional(v.string()), runId: v.optional(v.id("jobRuns")) },
  handler: async (ctx, args) => {
    const runId = args.runId ?? (await startRun(ctx, "retention sweep"));
    if (runId === null) return;
    try {
      const index = args.step ?? 0;
      const step = RETENTION_STEPS[index];
      if (!step) {
        await recordPage(ctx, runId, { items: 0, done: true });
        return;
      }
      const cutoff = Date.now() - RETENTION_POLICY[step] * DAY;
      const res = step === "snapshots" || step === "stageSnapshots" ? await thin(ctx, step, cutoff, args.cursor) : await purge(ctx, step, cutoff);
      await recordPage(ctx, runId, { items: res.items });
      const next = res.more ? { step: index, cursor: res.cursor, runId } : { step: index + 1, runId };
      await ctx.scheduler.runAfter(res.more ? 1000 : 0, internal.retention.sweep, next);
    } catch (e) {
      await failRun(ctx, runId, "retention sweep", e);
    }
  },
});
