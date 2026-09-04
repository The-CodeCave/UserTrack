// Paged background jobs. Every scheduled job walks its driving table with `paginate` so no single transaction
// reads or writes more than one page, and records what happened in `jobRuns` (docs/ARCHITECTURE.md → Jobs).
import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
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

export async function startRun(ctx: MutationCtx, job: string) {
  return ctx.db.insert("jobRuns", { job, startedAt: Date.now(), pages: 0, items: 0, errors: 0 });
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
    const recent = await ctx.db.query("jobRuns").withIndex("by_time").order("desc").take(50);
    const latest = new Map<string, Doc<"jobRuns">>();
    for (const run of recent) if (!latest.has(run.job)) latest.set(run.job, run);
    return [...latest.values()].map((r) => ({ job: r.job, startedAt: r.startedAt, finishedAt: r.finishedAt, items: r.items, errors: r.errors }));
  },
});
