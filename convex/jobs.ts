// Paged background jobs. Every scheduled job walks its driving table with `paginate` so no single transaction
// reads or writes more than one page, and records what happened in `jobRuns` (docs/ARCHITECTURE.md → Jobs).
import { v } from "convex/values";
import { internalMutation, query, type ActionCtx, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireGateway } from "./lib/gateway";

// Page sizes: projects per transaction, chosen so the heaviest page stays far below Convex's 8k-document /
// 1 MiB read limit. `daily` reads up to 400 dailyMetrics + all milestones per project, so it pages smallest.
export const PAGE = {
  daily: 10,
  rerank: 50,
  trust: 50,
  benchmarks: 50,
  share: 100,
  snapshot: 200,
  cohorts: 200,
  // Reads up to THIN_SCAN snapshots per product while thinning (convex/retention.ts).
  retention: 10,
  integrations: 500,
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// How long a run may stay open before a new trigger treats it as abandoned. Roughly "much longer than the job has ever
// taken, much shorter than its cron interval", so a crashed chain self-heals before the next natural trigger.
export const LOCK_TTL_MS: Record<string, number> = {
  "rerank leaderboard": 30 * MINUTE,
  "sync all integrations": 3 * HOUR,
  "weekly digest": 12 * HOUR,
  "monthly growth report": 12 * HOUR,
};
export const DEFAULT_LOCK_TTL_MS = 6 * HOUR;
export const lockTtlMs = (job: string) => LOCK_TTL_MS[job] ?? DEFAULT_LOCK_TTL_MS;

// Acquires the run lock for `job`: `null` means a previous chain is still paging and this trigger must do nothing at all
// (no row, no reschedule). A run left open past its TTL is closed as abandoned so a crashed chain cannot block forever.
export async function startRun(ctx: MutationCtx, job: string): Promise<Id<"jobRuns"> | null> {
  const now = Date.now();
  const last = await ctx.db.query("jobRuns").withIndex("by_job_time", (q) => q.eq("job", job)).order("desc").first();
  if (last && last.finishedAt === undefined) {
    if (now - last.startedAt < lockTtlMs(job)) {
      console.warn(`job ${job} still running, skipped`);
      return null;
    }
    await ctx.db.patch(last._id, { finishedAt: now, lastError: "abandoned (lock expired)" });
  }
  return ctx.db.insert("jobRuns", { job, startedAt: now, pages: 0, items: 0, errors: 0 });
}

// A page that throws outside the per-item guard closes its run instead of holding the lock until the TTL expires.
export async function failRun(ctx: MutationCtx, runId: Id<"jobRuns">, job: string, e: unknown) {
  await recordPage(ctx, runId, { items: 0, errors: 1, lastError: jobError(job, "page", e), done: true });
}

// Same from an action driver, where nothing rolls back: the caller rethrows after the lock is released.
export async function failActionRun(ctx: ActionCtx, runId: Id<"jobRuns">, job: string, e: unknown) {
  await ctx.runMutation(internal.jobs.record, { runId, items: 0, errors: 1, lastError: jobError(job, "page", e), done: true });
}

// One page finished: counts are accumulated, the run is closed when `done`.
export async function recordPage(ctx: MutationCtx, runId: Id<"jobRuns">, page: { items: number; errors?: number; lastError?: string; done?: boolean }) {
  const run = await ctx.db.get(runId);
  if (!run) return;
  await ctx.db.patch(runId, {
    pages: run.pages + 1,
    items: run.items + page.items,
    errors: run.errors + (page.errors ?? 0),
    lastError: page.lastError ?? run.lastError,
    // Only on the final page: an explicit `undefined` would DELETE finishedAt on an already-closed run.
    ...(page.done ? { finishedAt: Date.now() } : {}),
  });
}

// A per-item failure never stops the page: it is logged and counted on the run.
export function jobError(job: string, id: string, e: unknown) {
  const message = `${id}: ${(e as Error).message ?? String(e)}`.slice(0, 300);
  console.error(`${job} ${message}`);
  return message;
}

export const begin = internalMutation({
  args: { job: v.string() },
  handler: async (ctx, { job }) => startRun(ctx, job),
});

export const record = internalMutation({
  args: { runId: v.id("jobRuns"), items: v.number(), errors: v.optional(v.number()), lastError: v.optional(v.string()), done: v.optional(v.boolean()) },
  handler: async (ctx, { runId, ...page }) => recordPage(ctx, runId, page),
});

// Operator summary for /api/health?deep=1: the latest run of each job, from a bounded window of recent runs.
export const health = query({
  args: { gateway: v.optional(v.string()) },
  handler: async (ctx, { gateway }) => {
    requireGateway(gateway);
    const now = Date.now();
    const recent = await ctx.db.query("jobRuns").withIndex("by_time").order("desc").take(50);
    const latest = new Map<string, Doc<"jobRuns">>();
    for (const run of recent) if (!latest.has(run.job)) latest.set(run.job, run);
    return [...latest.values()].map((r) => ({
      job: r.job, startedAt: r.startedAt, finishedAt: r.finishedAt, items: r.items, errors: r.errors,
      running: r.finishedAt === undefined,
      stale: r.finishedAt === undefined && now - r.startedAt >= lockTtlMs(r.job),
    }));
  },
});
