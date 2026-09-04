/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { RETENTION_POLICY } from "./retention";
import { DAY, dayKey, dayStart } from "./lib/time";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const NOW = Date.UTC(2026, 8, 4, 12);
const t = () => convexTest(schema, modules);
const older = (table: keyof typeof RETENTION_POLICY) => NOW - (RETENTION_POLICY[table] + 1) * DAY;
const fresh = (table: keyof typeof RETENTION_POLICY) => NOW - (RETENTION_POLICY[table] - 1) * DAY;

beforeEach(() => vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: NOW }));
afterEach(() => vi.useRealTimers());

// One row per table that is far past its retention period and one that is just inside it.
async function seed(tx: ReturnType<typeof t>) {
  return tx.run(async (ctx) => {
    const profileId = await ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true });
    const saasId = await ctx.db.insert("saas", {
      ownerId: profileId, name: "P", slug: "p", description: "d", websiteUrl: "https://p.io", tags: [], isPublic: true, trust: "verified",
      totalUsers: 100, newUsers24h: 1, newUsers7d: 7, newUsers30d: 30, newUsersPrev30d: 20, growth30dPct: 50, growth7dPct: 5, trustScore: 80,
    });
    const integrationId = await ctx.db.insert("integrations", { saasId, provider: "manual", role: "users", config: {}, status: "ok", trust: "unverified" });
    const endpointId = await ctx.db.insert("webhookEndpoints", { profileId, url: "https://hooks.example.com/x", events: ["webhook.test"], secret: "s", secretPrefix: "whs_abc", status: "active", consecutiveFailures: 0, createdAt: NOW, updatedAt: NOW });
    const tokenId = await ctx.db.insert("developerTokens", { profileId, type: "api", name: "t", prefix: "ut_a", hash: "h", scopes: ["read"], createdAt: NOW });

    for (const startedAt of [older("syncRuns"), fresh("syncRuns")]) await ctx.db.insert("syncRuns", { saasId, integrationId, startedAt, status: "ok" });
    const delivery = { endpointId, profileId, eventId: "e", deliveryId: "d", type: "webhook.test" as const, payload: {}, attempt: 1 };
    for (const status of ["success", "exhausted", "pending", "failed"] as const) {
      await ctx.db.insert("webhookDeliveries", { ...delivery, status, createdAt: older("webhookDeliveries") });
      await ctx.db.insert("webhookDeliveries", { ...delivery, status, createdAt: fresh("webhookDeliveries") });
    }
    for (const createdAt of [older("emailEvents"), fresh("emailEvents")]) {
      await ctx.db.insert("emailEvents", { emailType: "digest", category: "product", recipient: "a@b.c", dedupeKey: `k${createdAt}`, status: "sent", attempts: 1, createdAt });
    }
    for (const at of [older("apiUsage"), fresh("apiUsage")]) await ctx.db.insert("apiUsage", { tokenId, day: dayKey(at), category: "read", count: 3, updatedAt: at });
    for (const at of [older("auditLogs"), fresh("auditLogs")]) await ctx.db.insert("auditLogs", { profileId, action: "project.update", ok: true, at });
    for (const createdAt of [older("oauthStates"), fresh("oauthStates")]) await ctx.db.insert("oauthStates", { state: `s${createdAt}`, profileId, provider: "x", codeVerifier: "v", createdAt });
    for (const startedAt of [older("backfills"), fresh("backfills")]) {
      await ctx.db.insert("backfills", { saasId, integrationId, provider: "manual", role: "users", fromDay: "2026-01-01", toDay: "2026-01-31", status: "ok", trigger: "manual", startedAt });
    }
    for (const startedAt of [older("jobRuns"), fresh("jobRuns")]) await ctx.db.insert("jobRuns", { job: "daily sweep", startedAt, pages: 1, items: 1, errors: 0 });
    return { saasId, profileId };
  });
}

// Four samples on each of two expired days plus four on a recent day.
async function seedSamples(tx: ReturnType<typeof t>, saasId: Id<"saas">) {
  const old = older("snapshots");
  await tx.run(async (ctx) => {
    for (const base of [dayStart(old), dayStart(old) - DAY, dayStart(fresh("snapshots"))]) {
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("snapshots", { saasId, totalUsers: 100 + i, capturedAt: base + i * 6 * 3_600_000, source: "manual", trust: "unverified" });
        for (const stage of ["activated", "converted"] as const) {
          await ctx.db.insert("stageSnapshots", { saasId, stage, value: 10 + i, capturedAt: base + i * 6 * 3_600_000, source: "manual", trust: "unverified" });
        }
      }
    }
  });
}

const rows = <T extends TableNames>(tx: ReturnType<typeof t>, table: T): Promise<Doc<T>[]> => tx.run((ctx) => ctx.db.query(table).collect());

describe("retention sweep", () => {
  it("deletes only rows past their retention period", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    await seedSamples(tx, saasId);
    await tx.mutation(internal.retention.sweep, {});
    await tx.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await rows(tx, "syncRuns")).map((r) => r.startedAt)).toEqual([fresh("syncRuns")]);
    expect((await rows(tx, "emailEvents")).map((r) => r.createdAt)).toEqual([fresh("emailEvents")]);
    expect((await rows(tx, "apiUsage")).map((r) => r.day)).toEqual([dayKey(fresh("apiUsage"))]);
    expect((await rows(tx, "auditLogs")).map((r) => r.at)).toEqual([fresh("auditLogs")]);
    expect(await rows(tx, "oauthStates")).toHaveLength(1);
    expect((await rows(tx, "backfills")).map((r) => r.startedAt)).toEqual([fresh("backfills")]);
    // The sweep's own run row survives; the expired one is gone.
    const runs = await rows(tx, "jobRuns");
    expect(runs.filter((r) => r.job === "daily sweep").map((r) => r.startedAt)).toEqual([fresh("jobRuns")]);
    const run = runs.find((r) => r.job === "retention sweep")!;
    expect(run.finishedAt).toBeGreaterThanOrEqual(run.startedAt);
    expect(run.pages).toBe(11);
  });

  it("keeps webhook deliveries that can still be retried", async () => {
    const tx = t();
    await seed(tx);
    await tx.mutation(internal.retention.sweep, {});
    await tx.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await rows(tx, "webhookDeliveries");
    expect(left.filter((d) => d.createdAt === older("webhookDeliveries")).map((d) => d.status).sort()).toEqual(["failed", "pending"]);
    expect(left.filter((d) => d.createdAt === fresh("webhookDeliveries"))).toHaveLength(4);
  });

  it("thins expired samples to the last row of each UTC day and leaves recent ones alone", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    await seedSamples(tx, saasId);
    await tx.mutation(internal.retention.sweep, {});
    await tx.finishAllScheduledFunctions(vi.runAllTimers);

    const snaps = await rows(tx, "snapshots");
    const cutoff = NOW - RETENTION_POLICY.snapshots * DAY;
    const expired = snaps.filter((s) => s.capturedAt < cutoff);
    expect(expired).toHaveLength(2);
    // The kept row of a day is its last one (18:00 of the four 6-hourly samples).
    expect(expired.every((s) => s.totalUsers === 103)).toBe(true);
    expect(new Set(expired.map((s) => dayKey(s.capturedAt))).size).toBe(2);
    expect(snaps.filter((s) => s.capturedAt >= cutoff)).toHaveLength(4);

    const stages = await rows(tx, "stageSnapshots");
    expect(stages.filter((s) => s.capturedAt < cutoff)).toHaveLength(4); // 2 days × 2 stages
    expect(stages.filter((s) => s.capturedAt >= cutoff)).toHaveLength(8);
  });
});
