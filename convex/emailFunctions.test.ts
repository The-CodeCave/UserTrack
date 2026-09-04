/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Better Auth users live in a component; the email system reaches them only through this bridge.
const users = new Map<string, { email: string; name: string; emailVerified: boolean }>();
vi.mock("./email/users", () => ({ findAuthUser: async (_ctx: unknown, id: string) => users.get(id) ?? null }));

const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules);
const DAY = 86_400_000;

async function seedOwner(tx: ReturnType<typeof t>, userId = "u1", onboardingCompleted = true) {
  users.set(userId, { email: `${userId}@example.com`, name: "Ada", emailVerified: true });
  return tx.run(async (ctx) => ctx.db.insert("profiles", { userId, username: userId, displayName: "Ada", onboardingCompleted }));
}

async function seedSaas(tx: ReturnType<typeof t>, ownerId: Id<"profiles">, patch: Record<string, unknown> = {}) {
  return tx.run(async (ctx) =>
    ctx.db.insert("saas", { ownerId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], isPublic: true, trust: "verified", totalUsers: 900, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, growth30dPct: 0, ...patch }),
  );
}

const events = (tx: ReturnType<typeof t>) => tx.run(async (ctx) => ctx.db.query("emailEvents").collect());

beforeEach(() => {
  users.clear();
  process.env.EMAIL_TOKEN_SECRET = "test-secret";
  process.env.SITE_URL = "https://usertrack.dev";
});

describe("enqueue", () => {
  it("dedupes, respects preferences and suppression, and lets transactional mail through", async () => {
    const tx = t();
    await seedOwner(tx);
    const { enqueue } = await import("./email/send");
    const first = await tx.run((ctx) => enqueue(ctx, { userId: "u1", type: "profile-reminder", dedupeKey: "profile-reminder:u1", data: { name: "Ada" } }));
    expect(first.status).toBe("queued");
    const again = await tx.run((ctx) => enqueue(ctx, { userId: "u1", type: "profile-reminder", dedupeKey: "profile-reminder:u1", data: { name: "Ada" } }));
    expect(again.status).toBe("duplicate");
    expect((await events(tx)).length).toBe(1);

    await tx.run((ctx) => ctx.db.insert("emailPreferences", { userId: "u1", productNudges: true, growthMilestones: false, rankingMilestones: true, growthAlerts: true, monthlyReport: true, weeklyDigest: false, followedSaasUpdates: false, updatedAt: 0 }));
    const off = await tx.run((ctx) => enqueue(ctx, { userId: "u1", type: "user-milestone", dedupeKey: "user-milestone:x:100", data: { saasName: "A", slug: "a", threshold: 100, totalUsers: 120, isPublic: true } }));
    expect(off).toEqual({ status: "skipped", reason: "preference:growthMilestones" });

    await tx.run((ctx) => ctx.db.insert("emailRecipients", { email: "u1@example.com", status: "bounced", updatedAt: 0 }));
    const bounced = await tx.run((ctx) => enqueue(ctx, { userId: "u1", type: "rank-milestone", dedupeKey: "rank-milestone:x:top10", data: { saasName: "A", slug: "a", threshold: 10, rank: 9, newUsers30d: 1, growth30dPct: 1 } }));
    expect(bounced).toEqual({ status: "skipped", reason: "recipient:bounced" });
    const sourceFailed = await tx.run((ctx) => enqueue(ctx, { userId: "u1", type: "source-failed", dedupeKey: "source-failed:i:1", data: { saasName: "A", saasId: "s", provider: "Clerk", failures: 6 } }));
    expect(sourceFailed).toEqual({ status: "skipped", reason: "recipient:bounced" });

    users.set("u2", { email: "u2@example.com", name: "B", emailVerified: true });
    const rows = await events(tx);
    expect(rows.map((e) => e.status).sort()).toEqual(["queued", "skipped", "skipped", "skipped"]);
    expect(rows.find((e) => e.status === "queued")?.metadata.data).toEqual({ name: "Ada" });
  });

  it("without RESEND_API_KEY the delivery marks the event failed (not retried) and records nothing else", async () => {
    delete process.env.RESEND_API_KEY;
    const tx = t();
    await seedOwner(tx);
    const { enqueue } = await import("./email/send");
    await tx.run((ctx) => enqueue(ctx, { userId: "u1", type: "profile-reminder", dedupeKey: "profile-reminder:u1", data: { name: "Ada" } }));
    await tx.finishAllScheduledFunctions(vi.fn());
    const [e] = await events(tx);
    expect(e).toMatchObject({ status: "failed", error: "email not configured", attempts: 1 });
  });

  it("delivers through the provider, stores the message id, and retries transient failures", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const calls: string[] = [];
    let fail = true;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(init.body as string).subject);
      if (fail) { fail = false; return new Response("boom", { status: 503 }); }
      return new Response(JSON.stringify({ id: "em_123" }), { status: 200 });
    });
    vi.useFakeTimers();
    try {
      const tx = t();
      await seedOwner(tx);
      const { enqueue } = await import("./email/send");
      await tx.run((ctx) => enqueue(ctx, { userId: "u1", type: "profile-reminder", dedupeKey: "profile-reminder:u1", data: { name: "Ada" } }));
      await tx.finishAllScheduledFunctions(vi.runAllTimers);
      const [e] = await events(tx);
      expect(e).toMatchObject({ status: "sent", providerMessageId: "em_123", attempts: 2 });
      expect(calls).toEqual(["Finish setting up your UserTrack profile", "Finish setting up your UserTrack profile"]);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      delete process.env.RESEND_API_KEY;
    }
  });
});

describe("lifecycle", () => {
  it("profile reminder only when onboarding is incomplete, once", async () => {
    const tx = t();
    users.set("new", { email: "new@example.com", name: "New", emailVerified: false });
    await tx.mutation(internal.email.lifecycle.profileReminder, { userId: "new" });
    await tx.mutation(internal.email.lifecycle.profileReminder, { userId: "new" });
    expect((await events(tx)).filter((e) => e.emailType === "profile-reminder" && e.status === "queued").length).toBe(1);
    await seedOwner(tx, "done", true);
    await tx.mutation(internal.email.lifecycle.profileReminder, { userId: "done" });
    expect((await events(tx)).some((e) => e.userId === "done")).toBe(false);
  });

  it("missing-source reminder skips products that already synced", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const bare = await seedSaas(tx, owner);
    const synced = await seedSaas(tx, owner, { slug: "b" });
    await tx.run((ctx) => ctx.db.insert("integrations", { saasId: synced, provider: "clerk", role: "users", config: {}, status: "ok", trust: "verified", lastSuccessAt: 1 }));
    await tx.mutation(internal.email.lifecycle.missingSourceReminder, { saasId: bare });
    await tx.mutation(internal.email.lifecycle.missingSourceReminder, { saasId: synced });
    await tx.mutation(internal.email.lifecycle.missingSourceReminder, { saasId: bare });
    const rows = await events(tx);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ emailType: "missing-source", saasId: bare, status: "queued" });
  });

  it("source failure → one mail per episode, recovery mail, then a new failure mail", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const saasId = await seedSaas(tx, owner);
    const now = Date.now();
    const integrationId = await tx.run((ctx) => ctx.db.insert("integrations", { saasId, provider: "clerk", role: "users", config: {}, status: "error", trust: "verified", lastSuccessAt: now - DAY, connectedAt: now - 10 * DAY }));
    const { onSourceFailure, onSourceSuccess } = await import("./email/lifecycle");
    const integ = () => tx.run(async (ctx) => (await ctx.db.get(integrationId))!);
    const fail = async (n: number) => { const i = await integ(); await tx.run((ctx) => onSourceFailure(ctx, i, n, "401")); };
    const ok = async (total: number, first: boolean) => { const i = await integ(); const s = await tx.run(async (ctx) => (await ctx.db.get(saasId))!); await tx.run((ctx) => onSourceSuccess(ctx, i, s, total, first)); };
    await fail(2);
    expect((await events(tx)).length).toBe(0);
    await fail(6);
    await fail(7);
    expect((await events(tx)).filter((e) => e.emailType === "source-failed").length).toBe(1);
    expect((await integ()).healthState).toBe("unhealthy");
    await ok(950, false);
    await ok(951, false);
    expect((await events(tx)).filter((e) => e.emailType === "source-recovered").length).toBe(1);
    expect((await integ()).healthState).toBe("healthy");
    await fail(6);
    expect((await events(tx)).filter((e) => e.emailType === "source-failed").length).toBe(2);
    // First-ever success sends the connected mail exactly once.
    await ok(951, true);
    await ok(952, true);
    expect((await events(tx)).filter((e) => e.emailType === "source-connected").length).toBe(1);
  });

  it("no-growth sweep fires once per quiet period for healthy, public products with traction", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const saasId = await seedSaas(tx, owner, { totalUsers: 500, newUsers7d: 0, newUsers30d: 40 });
    await tx.run((ctx) => ctx.db.insert("integrations", { saasId, provider: "clerk", role: "users", config: {}, status: "ok", trust: "verified", healthState: "healthy" }));
    await tx.run(async (ctx) => {
      for (let i = 12; i >= 1; i--) {
        const day = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
        await ctx.db.insert("dailyMetrics", { saasId, day, totalUsers: 500, newUsers: i > 8 ? 5 : 0 });
      }
    });
    await tx.mutation(internal.email.lifecycle.noGrowthSweep, {});
    await tx.mutation(internal.email.lifecycle.noGrowthSweep, {});
    const rows = (await events(tx)).filter((e) => e.emailType === "no-growth");
    expect(rows.length).toBe(1);
    expect(rows[0].dedupeKey.startsWith(`no-growth:${saasId}:`)).toBe(true);
  });
});

describe("growth", () => {
  it("user milestones: highest threshold mails once, lower ones are recorded as superseded", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const saasId = await seedSaas(tx, owner);
    const { onUsersSnapshot } = await import("./email/growth");
    const saas = await tx.run(async (ctx) => (await ctx.db.get(saasId))!);
    await tx.run((ctx) => onUsersSnapshot(ctx, saas, 90, 1200));
    await tx.run((ctx) => onUsersSnapshot(ctx, saas, 1100, 1200));
    await tx.run((ctx) => onUsersSnapshot(ctx, saas, 90, 1200));
    const rows = (await events(tx)).filter((e) => e.emailType === "user-milestone");
    expect(rows.map((r) => [r.dedupeKey.split(":").pop(), r.status]).sort()).toEqual([["100", "skipped"], ["1000", "queued"], ["250", "skipped"], ["500", "skipped"]]);
    // Later crossing knows the previous milestone.
    await tx.run((ctx) => onUsersSnapshot(ctx, saas, 2400, 2600));
    const next = (await events(tx)).find((e) => e.dedupeKey.endsWith(":2500"));
    expect(next?.metadata.data).toMatchObject({ threshold: 2500, previousThreshold: 1000 });
    expect((await events(tx)).some((e) => e.emailType === "followed-update")).toBe(false);
  });

  it("rank milestones fire per tier once and stay quiet on a tiny board", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const saasId = await seedSaas(tx, owner);
    const { onRerank } = await import("./email/growth");
    const saas = await tx.run(async (ctx) => (await ctx.db.get(saasId))!);
    await tx.run((ctx) => onRerank(ctx, saas, undefined, 3, 4));
    expect((await events(tx)).length).toBe(0);
    await tx.run((ctx) => onRerank(ctx, saas, undefined, 8, 200));
    await tx.run((ctx) => onRerank(ctx, saas, 12, 8, 200));
    await tx.run((ctx) => onRerank(ctx, saas, 8, 4, 200));
    const rows = (await events(tx)).filter((e) => e.emailType === "rank-milestone");
    expect(rows.map((r) => [r.dedupeKey.split(":").pop(), r.status]).sort()).toEqual([["top10", "queued"], ["top100", "skipped"], ["top25", "skipped"], ["top5", "queued"], ["top50", "skipped"]]);
  });

  it("spike alerts honour the cooldown", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const saasId = await seedSaas(tx, owner, { newUsers24h: 60 });
    const { onSpikeCheck } = await import("./email/growth");
    const saas = await tx.run(async (ctx) => (await ctx.db.get(saasId))!);
    const history = Array(30).fill(10);
    await tx.run((ctx) => onSpikeCheck(ctx, saas, history));
    await tx.run((ctx) => onSpikeCheck(ctx, { ...saas, newUsers24h: 90 }, history));
    expect((await events(tx)).filter((e) => e.emailType === "growth-spike").length).toBe(1);
    await tx.run((ctx) => onSpikeCheck(ctx, saas, Array(30).fill(50)));
    expect((await events(tx)).filter((e) => e.emailType === "growth-spike").length).toBe(1);
  });

  it("followers are notified conservatively and never the owner", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const saasId = await seedSaas(tx, owner);
    users.set("fan", { email: "fan@example.com", name: "Fan", emailVerified: true });
    users.set("quiet", { email: "quiet@example.com", name: "Quiet", emailVerified: true });
    const fan = await tx.run((ctx) => ctx.db.insert("profiles", { userId: "fan", username: "fan", displayName: "Fan", onboardingCompleted: true }));
    const quiet = await tx.run((ctx) => ctx.db.insert("profiles", { userId: "quiet", username: "quiet", displayName: "Quiet", onboardingCompleted: true }));
    await tx.run(async (ctx) => {
      await ctx.db.insert("follows", { followerId: fan, targetType: "saas", targetId: saasId });
      await ctx.db.insert("follows", { followerId: quiet, targetType: "profile", targetId: owner });
      await ctx.db.insert("follows", { followerId: owner, targetType: "saas", targetId: saasId });
      await ctx.db.insert("emailPreferences", { userId: "fan", productNudges: true, growthMilestones: true, rankingMilestones: true, growthAlerts: true, monthlyReport: true, weeklyDigest: false, followedSaasUpdates: true, updatedAt: 0 });
    });
    await tx.mutation(internal.email.growth.notifyFollowers, { saasId, key: "users:1000", kind: "milestone", headline: "Acme crossed 1,000 users", detail: "d" });
    const rows = (await events(tx)).filter((e) => e.emailType === "followed-update");
    expect(rows.map((r) => [r.userId, r.status]).sort()).toEqual([["fan", "queued"], ["quiet", "skipped"]]);
  });
});

describe("monthly report", () => {
  it("builds one consolidated report per profile, schedules local-morning delivery, dedupes", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await tx.run((ctx) => ctx.db.insert("emailPreferences", { userId: "u1", productNudges: true, growthMilestones: true, rankingMilestones: true, growthAlerts: true, monthlyReport: true, weeklyDigest: false, followedSaasUpdates: false, timezone: "Europe/Berlin", updatedAt: 0 }));
    const a = await seedSaas(tx, owner, { totalUsers: 1300 });
    const b = await seedSaas(tx, owner, { slug: "beta", name: "Beta", totalUsers: 0 });
    await tx.run(async (ctx) => {
      await ctx.db.insert("dailyMetrics", { saasId: a, day: "2026-07-31", totalUsers: 1000, newUsers: 5, rank: 14 });
      await ctx.db.insert("dailyMetrics", { saasId: a, day: "2026-08-10", totalUsers: 1100, newUsers: 100, activatedUsers: 400 });
      await ctx.db.insert("dailyMetrics", { saasId: a, day: "2026-08-31", totalUsers: 1300, newUsers: 200, activatedUsers: 500, rank: 8 });
      await ctx.db.insert("dailyMetrics", { saasId: a, day: "2026-09-01", totalUsers: 1310, newUsers: 10 });
    });
    await tx.mutation(internal.email.reports.generateMonthly, { period: "2026-08" });
    await tx.mutation(internal.email.reports.generateMonthly, { period: "2026-08" });
    const reports = await tx.run((ctx) => ctx.db.query("monthlyReports").collect());
    expect(reports.length).toBe(1);
    const p = reports[0].payload;
    expect(p.summary).toMatchObject({ totalNewUsers: 300, totalUsersEnd: 1300, strongest: "Acme" });
    expect(p.projects.map((x: { name: string; hasData: boolean }) => [x.name, x.hasData])).toEqual([["Acme", true], ["Beta", false]]);
    expect(p.projects[0]).toMatchObject({ usersStart: 1000, usersEnd: 1300, rankStart: 14, rankEnd: 8, activatedEnd: 500 });
    expect(new Date(reports[0].deliverAt).getUTCHours()).toBe(7);
    await tx.mutation(internal.email.reports.sendMonthly, { reportId: reports[0]._id });
    await tx.mutation(internal.email.reports.sendMonthly, { reportId: reports[0]._id });
    const rows = (await events(tx)).filter((e) => e.emailType === "monthly-report");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ dedupeKey: "monthly-report:u1:2026-08", status: "queued" });
    expect(b).toBeDefined();
  });

  it("skips profiles with no data and profiles who opted out", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedSaas(tx, owner);
    await tx.mutation(internal.email.reports.generateMonthly, { period: "2026-08" });
    expect((await tx.run((ctx) => ctx.db.query("monthlyReports").collect())).length).toBe(0);
    const off = await seedOwner(tx, "u2");
    const s = await seedSaas(tx, off, { slug: "s2" });
    await tx.run((ctx) => ctx.db.insert("dailyMetrics", { saasId: s, day: "2026-08-10", totalUsers: 10, newUsers: 1 }));
    await tx.run((ctx) => ctx.db.insert("emailPreferences", { userId: "u2", productNudges: true, growthMilestones: true, rankingMilestones: true, growthAlerts: true, monthlyReport: false, weeklyDigest: false, followedSaasUpdates: false, updatedAt: 0 }));
    await tx.mutation(internal.email.reports.generateMonthly, { period: "2026-08" });
    const reports = await tx.run((ctx) => ctx.db.query("monthlyReports").collect());
    expect(reports.length).toBe(1);
    await tx.mutation(internal.email.reports.sendMonthly, { reportId: reports[0]._id });
    expect((await events(tx))[0]).toMatchObject({ status: "skipped", metadata: { reason: "preference:monthlyReport" } });
  });
});

describe("weekly digest lock", () => {
  it("skips a second trigger while the first chain is still paging, so nobody is mailed twice", async () => {
    const tx = t();
    // 60 opted-in profiles → the first page is 50 and the run stays open; the first five have something to report.
    for (let i = 0; i < 60; i++) {
      const owner = await seedOwner(tx, `d${i}`);
      await tx.run((ctx) => ctx.db.insert("emailPreferences", { userId: `d${i}`, productNudges: true, growthMilestones: true, rankingMilestones: true, growthAlerts: true, monthlyReport: true, weeklyDigest: true, followedSaasUpdates: false, updatedAt: 0 }));
      if (i < 5) await seedSaas(tx, owner, { slug: `d${i}`, newUsers7d: 5 });
    }
    const runs = () => tx.run((ctx) => ctx.db.query("jobRuns").withIndex("by_job_time", (q) => q.eq("job", "weekly digest")).collect());
    const digestMails = async () => (await events(tx)).filter((e) => e.emailType === "weekly-digest");
    await tx.mutation(internal.digest.generate, {});
    expect((await runs())[0].finishedAt).toBeUndefined();
    expect(await digestMails()).toHaveLength(5);
    await tx.mutation(internal.digest.generate, {});
    expect(await runs()).toHaveLength(1);
    expect((await runs())[0].pages).toBe(1);
    expect(await digestMails()).toHaveLength(5);
  });
});

describe("webhook + preferences", () => {
  it("records delivery state and suppresses hard bounces and complaints", async () => {
    const tx = t();
    await seedOwner(tx);
    const id = await tx.run((ctx) => ctx.db.insert("emailEvents", { userId: "u1", emailType: "monthly-report", category: "growth", recipient: "u1@example.com", dedupeKey: "k", status: "sent", attempts: 1, providerMessageId: "em_1", createdAt: 0 }));
    await tx.mutation(internal.email.webhook.record, { type: "email.delivered", messageId: "em_1" });
    expect((await tx.run((ctx) => ctx.db.get(id)))?.status).toBe("delivered");
    await tx.mutation(internal.email.webhook.record, { type: "email.bounced", messageId: "em_1", bounceType: "Transient" });
    expect(await tx.run((ctx) => ctx.db.query("emailRecipients").collect())).toEqual([]);
    await tx.mutation(internal.email.webhook.record, { type: "email.bounced", messageId: "em_1", bounceType: "Permanent" });
    expect((await tx.run((ctx) => ctx.db.query("emailRecipients").collect()))[0]).toMatchObject({ email: "u1@example.com", status: "bounced" });
    await tx.mutation(internal.email.webhook.record, { type: "email.complained", messageId: "em_1" });
    expect((await tx.run((ctx) => ctx.db.query("emailRecipients").collect()))[0]).toMatchObject({ status: "complained" });
  });

  it("signed token reads and updates preferences; one-click unsubscribe turns everything optional off", async () => {
    const tx = t();
    await seedOwner(tx);
    const token = await tx.query(internal.email.prefs.tokenFor, { userId: "u1" });
    const before = await tx.query(internal.email.prefs.byTokenInternal, { token });
    expect(before).toMatchObject({ monthlyReport: true, weeklyDigest: false, emailMasked: "u1…@example.com" });
    expect(await tx.mutation(internal.email.prefs.unsubscribeByToken, { token })).toBe(true);
    expect(await tx.mutation(internal.email.prefs.unsubscribeByToken, { token: "bad.token" })).toBe(false);
    const after = await tx.query(internal.email.prefs.byTokenInternal, { token });
    expect(after).toMatchObject({ monthlyReport: false, productNudges: false, growthAlerts: false });
  });
});
