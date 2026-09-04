import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { PAGE, failRun, jobError, recordPage, startRun } from "./jobs";
import type { Doc, Id } from "./_generated/dataModel";
import { trendingScore } from "./lib/trending";
import { growth24h, isVerified } from "./lib/boardRules";
import { rankMilestones, trendingMilestones } from "./lib/milestones";
import { addMilestones } from "./trust";
import { onRerank } from "./email/growth";
import { DAY, dayKey } from "./lib/time";
import { isRankJump } from "./lib/history";
import { addEvent } from "./domain/events";
import { dispatchEvent } from "./webhooks";

export const rankable = (s: Doc<"saas">) => s.isPublic && s.trust === "verified" && !s.isDemo && s.trustState !== "review";

const WINDOWS = ["24h", "7d", "30d"] as const;
type Window = (typeof WINDOWS)[number];
type Kind = "leaderboard" | "trending";

export function trendingInputs(s: Doc<"saas">, now = Date.now()) {
  const input = (newUsers: number, prev: number | undefined) => ({
    newUsers, prevNewUsers: prev ?? 0, baseUsers: s.totalUsers - newUsers, trustScore: s.trustScore, activationRatePct: s.activationRatePct, signupToConvertedPct: s.signupToConvertedPct,
    lastSyncedAt: s.lastSyncedAt, firstSnapshotAt: s.firstSnapshotAt, underReview: s.trustState === "review", now,
  });
  return { "24h": input(s.newUsers24h, s.newUsersPrev24h), "7d": input(s.newUsers7d, s.newUsersPrev7d), "30d": input(s.newUsers30d, s.newUsersPrev30d) } satisfies Record<Window, unknown>;
}

// One history row per (project, board, window, UTC day): the day's last position. Past days are never rewritten.
async function upsertRankHistory(ctx: MutationCtx, saasId: Id<"saas">, kind: Kind, window: Window, day: string, rank: number, at: number, score?: number) {
  const row = await ctx.db.query("rankHistory").withIndex("by_saas_kind_window_day", (q) => q.eq("saasId", saasId).eq("kind", kind).eq("window", window).eq("day", day)).unique();
  if (row) {
    if (row.rank !== rank || row.score !== score) await ctx.db.patch(row._id, { rank, score, at });
  } else await ctx.db.insert("rankHistory", { saasId, kind, window, day, rank, score, at });
}

// Position on (or the closest stored day before) `day`, no older than `floorDay`. Undefined = not ranked then.
export async function rankOn(ctx: MutationCtx, saasId: Id<"saas">, kind: Kind, window: Window, day: string, floorDay: string) {
  const row = await ctx.db.query("rankHistory").withIndex("by_saas_kind_window_day", (q) => q.eq("saasId", saasId).eq("kind", kind).eq("window", window).gte("day", floorDay).lte("day", day)).order("desc").first();
  return row?.rank;
}

// ---- Rerank -------------------------------------------------------------------------------------------------------
// Four scheduler-chained steps, so neither a transaction nor a single function ever holds the whole table:
// (1) `rerank` pages `saas` and writes one compact `rankScratch` row per product, (2) `rankPlan` reads those rows,
// computes every ordering in memory with the same pure comparators as before, stamps the ranks back onto them and
// writes the directory counters, (3) `applyRanks` pages the scratch rows, patches the products and deletes the rows
// it applied. Every step carries the same `runId` and the same `now`; only phase 3 records pages on the run.
// Ceiling: phase 2 reads and patches every scratch row in one transaction — Convex's per-transaction document limits
// put that at ~8k products (A219); carrying the accumulator in scheduler args instead would need ~10 MB at 50k.
const SCRATCH_MAX = 8000;
// A chain that died between pages leaves its rows behind; the next run drops that many before it starts.
const SCRATCH_SWEEP = 500;

// The public facts the directory counters are summed from (convex/schema.ts → publicStats).
interface PublicRow { verified: boolean; totalUsers: number; newUsers30d: number; category?: string; stacks?: string[]; lastSyncedAt?: number }

// Phase 1: one page of products projected into `rankScratch` (ids + the numbers the orderings need).
export const rerank = internalMutation({
  args: { cursor: v.optional(v.string()), runId: v.optional(v.id("jobRuns")), now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const runId = args.runId ?? (await startRun(ctx, "rerank leaderboard"));
    if (runId === null) return;
    try {
      if (args.runId === undefined) for (const stale of await ctx.db.query("rankScratch").take(SCRATCH_SWEEP)) await ctx.db.delete(stale._id);
      const page = await ctx.db.query("saas").paginate({ cursor: args.cursor ?? null, numItems: PAGE.rerank });
      for (const s of page.page) {
        const i = trendingInputs(s, now);
        const pub = s.isPublic ? { verified: isVerified(s), totalUsers: s.totalUsers, newUsers30d: s.newUsers30d, category: s.category, stacks: s.techStack, lastSyncedAt: s.lastSyncedAt } : undefined;
        await ctx.db.insert("rankScratch", {
          runId, saasId: s._id, slug: s.slug, eligible: rankable(s), newUsers30d: s.newUsers30d, growth30dPct: s.growth30dPct, totalUsers: s.totalUsers,
          s24: trendingScore(i["24h"]), s7: trendingScore(i["7d"]), s30: trendingScore(i["30d"]), pub,
        });
      }
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, { cursor: page.continueCursor, runId, now });
      else await ctx.scheduler.runAfter(0, internal.leaderboard.rankPlan, { runId, now });
    } catch (e) {
      await failRun(ctx, runId, "rerank leaderboard", e);
    }
  },
});

// Phase 2: the one global step. Ranks (30-day new users) and trending ranks per window for all public SaaS —
// demo rows and data-under-review are never ranked — stamped back onto the scratch rows, plus the directory counters.
export const rankPlan = internalMutation({
  args: { runId: v.id("jobRuns"), now: v.number() },
  handler: async (ctx, { runId, now }) => {
    try {
      const rows = await ctx.db.query("rankScratch").withIndex("by_run", (q) => q.eq("runId", runId)).take(SCRATCH_MAX);
      const eligible = rows.filter((s) => s.eligible);
      eligible.sort((a, b) => b.newUsers30d - a.newUsers30d || b.growth30dPct - a.growth30dPct || b.totalUsers - a.totalUsers);
      const ranks = new Map(eligible.map((s, i) => [s.saasId, i + 1]));

      // Deterministic: score desc, then 30-day new users, then total, then slug.
      const scoreIn = (s: Doc<"rankScratch">, w: Window) => (w === "24h" ? s.s24 : w === "7d" ? s.s7 : s.s30);
      const trendingRanks: Record<Window, Map<string, number>> = { "24h": new Map(), "7d": new Map(), "30d": new Map() };
      for (const w of WINDOWS) {
        const list = eligible.filter((s) => scoreIn(s, w) > 0).sort((a, b) => scoreIn(b, w) - scoreIn(a, w) || b.newUsers30d - a.newUsers30d || b.totalUsers - a.totalUsers || a.slug.localeCompare(b.slug));
        list.forEach((s, i) => trendingRanks[w].set(s.saasId, i + 1));
      }

      for (const row of rows) {
        await ctx.db.patch(row._id, { rank: ranks.get(row.saasId), t24: trendingRanks["24h"].get(row.saasId), t7: trendingRanks["7d"].get(row.saasId), t30: trendingRanks["30d"].get(row.saasId) });
      }
      await writePublicStats(ctx, publicStatsOf(rows), now);
      await ctx.scheduler.runAfter(0, internal.leaderboard.applyRanks, { runId, now, eligibleCount: eligible.length });
    } catch (e) {
      await failRun(ctx, runId, "rerank leaderboard", e);
    }
  },
});

// Directory-wide counters, summed once from the page walk the rerank already does (convex/public.ts → stats / boardMeta).
export function publicStatsOf(all: { pub?: PublicRow }[]) {
  const rows = all.flatMap((s) => (s.pub ? [s.pub] : []));
  const scope = () => ({ count: 0, verifiedCount: 0, updatedAt: undefined as number | undefined });
  const bucket = (map: Map<string, ReturnType<typeof scope>>, key: string, r: PublicRow) => {
    const b = map.get(key) ?? scope();
    b.count += 1;
    if (r.verified) b.verifiedCount += 1;
    b.updatedAt = Math.max(b.updatedAt ?? 0, r.lastSyncedAt ?? 0) || undefined;
    map.set(key, b);
  };
  const categories = new Map<string, ReturnType<typeof scope>>();
  const stacks = new Map<string, ReturnType<typeof scope>>();
  for (const r of rows) {
    if (r.category) bucket(categories, r.category, r);
    for (const t of new Set(r.stacks ?? [])) bucket(stacks, t, r);
  }
  const list = (map: Map<string, ReturnType<typeof scope>>) => [...map].map(([slug, b]) => ({ slug, ...b }));
  return {
    saasCount: rows.length,
    verifiedCount: rows.filter((r) => r.verified).length,
    trackedUsers: rows.reduce((a, r) => a + r.totalUsers, 0),
    newUsers30d: rows.reduce((a, r) => a + Math.max(0, r.newUsers30d), 0),
    updatedAt: rows.reduce((a, r) => Math.max(a, r.lastSyncedAt ?? 0), 0) || undefined,
    categories: list(categories),
    stacks: list(stacks),
  };
}

async function writePublicStats(ctx: MutationCtx, stats: ReturnType<typeof publicStatsOf>, now: number) {
  const row = { key: "public", ...stats, computedAt: now };
  const existing = await ctx.db.query("publicStats").withIndex("by_key", (q) => q.eq("key", "public")).unique();
  if (existing) await ctx.db.patch(existing._id, row);
  else await ctx.db.insert("publicStats", row);
}

// Phase 3: one page of patches, then the next page. A single product's failure is logged and never stops the page.
// Also appends the daily ranking history, materializes 7-day movement and emits rank-jump events + webhooks.
export const applyRanks = internalMutation({
  args: { runId: v.id("jobRuns"), now: v.number(), eligibleCount: v.number(), cursor: v.optional(v.string()) },
  handler: async (ctx, { runId, now, eligibleCount, cursor }) => {
    const day = dayKey(now);
    const weekAgo = dayKey(now - 7 * DAY);
    const floor = dayKey(now - 10 * DAY);
    try {
      const page = await ctx.db.query("rankScratch").withIndex("by_run", (q) => q.eq("runId", runId)).paginate({ cursor: cursor ?? null, numItems: PAGE.rerank });
      let errors = 0;
      let lastError: string | undefined;
      for (const row of page.page) {
        try {
          const s = await ctx.db.get(row.saasId);
          if (!s) continue;
          const { rank, t24, t7, t30 } = row;
          const sc = { "24h": row.s24, "7d": row.s7, "30d": row.s30 } as const;
          // Trending "previous" is the position at the last refresh (so a stable #1 reads "same", not "new" forever).
          const patch: Partial<Doc<"saas">> = { growth24hPct: growth24h(s), trendingScore24h: sc["24h"], trendingScore7d: sc["7d"], trendingScore30d: sc["30d"], prevTrendingRank: s.trendingRank, trendingRank: t7, prevTrendingRank24h: s.trendingRank24h, trendingRank24h: t24, prevTrendingRank30d: s.trendingRank30d, trendingRank30d: t30 };
          if (s.rank !== rank) { patch.prevRank = s.rank; patch.rank = rank; }
          if (rank && (s.bestRank === undefined || rank < s.bestRank)) patch.bestRank = rank;
          if (t7 && (s.bestTrendingRank === undefined || t7 < s.bestTrendingRank)) patch.bestTrendingRank = t7;

          // History + 7-day movement (stored positions only; a product without a row a week ago has no movement yet).
          if (rank !== undefined) await upsertRankHistory(ctx, s._id, "leaderboard", "30d", day, rank, now);
          for (const w of WINDOWS) {
            const r = w === "24h" ? t24 : w === "7d" ? t7 : t30;
            if (r !== undefined) await upsertRankHistory(ctx, s._id, "trending", w, day, r, now, sc[w]);
          }
          const rank7dAgo = rank === undefined ? undefined : await rankOn(ctx, s._id, "leaderboard", "30d", weekAgo, floor);
          const trendingRank7dAgo = t7 === undefined ? undefined : await rankOn(ctx, s._id, "trending", "7d", weekAgo, floor);
          patch.rank7dAgo = rank7dAgo;
          patch.rankDelta7d = rank !== undefined && rank7dAgo !== undefined ? rank7dAgo - rank : undefined;
          patch.trendingRank7dAgo = trendingRank7dAgo;
          patch.trendingRankDelta7d = t7 !== undefined && trendingRank7dAgo !== undefined ? trendingRank7dAgo - t7 : undefined;
          await ctx.db.patch(s._id, patch);

          if (!s.isDemo) {
            await addMilestones(ctx, s._id, rankMilestones(s.rank, rank, s.name, s.bestRank));
            await addMilestones(ctx, s._id, trendingMilestones(s.trendingRank, t7, s.name));
            await onRerank(ctx, s, s.rank, rank, eligibleCount);
            if (rank !== undefined && isRankJump(rank7dAgo, rank)) {
              const recent = await ctx.db.query("events").withIndex("by_saas_kind_day", (q) => q.eq("saasId", s._id).eq("kind", "rank_jump").gte("day", weekAgo)).first();
              if (!recent) await addEvent(ctx, s._id, "rank_jump", day, now, `#${rank7dAgo} → #${rank}`, `${s.name} climbed ${rank7dAgo! - rank} places on the leaderboard in 7 days.`, rank7dAgo! - rank);
            }
            const fresh = { ...s, ...patch } as Doc<"saas">;
            if (rank !== undefined && s.rank !== undefined && s.rank !== rank) await dispatchEvent(ctx, { type: "rank.changed", key: day, saas: fresh, data: { rank: { board: "leaderboard", window: "30d", from: s.rank, to: rank, best: patch.bestRank ?? s.bestRank } } });
            if (t7 !== undefined && s.trendingRank !== undefined && s.trendingRank !== t7) await dispatchEvent(ctx, { type: "trending.rank_changed", key: day, saas: fresh, data: { rank: { board: "trending", window: "7d", from: s.trendingRank, to: t7, score: sc["7d"] } } });
          }
        } catch (e) {
          errors++;
          lastError = jobError("rerank leaderboard", row.saasId, e);
        }
        await ctx.db.delete(row._id);
      }
      await recordPage(ctx, runId, { items: page.page.length, errors, lastError, done: page.isDone });
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.leaderboard.applyRanks, { runId, now, eligibleCount, cursor: page.continueCursor });
    } catch (e) {
      await failRun(ctx, runId, "rerank leaderboard", e);
    }
  },
});
