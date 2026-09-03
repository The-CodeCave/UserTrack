/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { dispatchEvent } from "./webhooks";
import { addMilestones } from "./trust";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const jane = await ctx.db.insert("profiles", { userId: "user_jane", username: "jane", displayName: "Jane", onboardingCompleted: true });
    const bob = await ctx.db.insert("profiles", { userId: "user_bob", username: "bob", displayName: "Bob", onboardingCompleted: true });
    const row = (ownerId: Id<"profiles">, slug: string) => ({ ownerId, name: slug, slug, description: "d", websiteUrl: `https://${slug}.io`, tags: [], category: "ai", isPublic: true, trust: "verified" as const, totalUsers: 900, newUsers24h: 20, newUsers7d: 120, newUsers30d: 400, growth30dPct: 80, growth7dPct: 15, trustScore: 80, lastSyncedAt: Date.now(), firstSnapshotAt: Date.now() - 30 * DAY });
    const acme = await ctx.db.insert("saas", row(jane, "acme"));
    const other = await ctx.db.insert("saas", row(jane, "other"));
    const bobs = await ctx.db.insert("saas", row(bob, "bobs"));
    return { jane, bob, acme, other, bobs };
  });
  return { t, ...ids };
}


describe("webhook endpoints", () => {
  it("creates endpoints with a one-time secret, rejects unsafe URLs and enforces ownership", async () => {
    const { t, jane, acme, bobs } = await seed();
    // Profiles are looked up through Better Auth in the app; the domain helpers take the profile directly.
    const created = await t.run(async (ctx) => (await import("./webhooks")).createEndpoint(ctx, jane, { url: "https://hooks.example.com/ut", events: ["milestone.reached", "growth.spike"], description: "Slack bridge" }));
    expect(created.secret.startsWith("whsec_")).toBe(true);
    expect(created.endpoint.secretMasked).toMatch(/^whsec_.{4}•+$/);
    expect(created.endpoint.status).toBe("active");
    expect(created.endpoint.events).toEqual(["milestone.reached", "growth.spike"]);
    // Errors are caught inside the transaction (a throw out of t.run would keep convex-test's lock).
    const tryCreate = (input: { url: string; events: string[]; saasId?: Id<"saas"> }) => t.run(async (ctx) => { try { await (await import("./webhooks")).createEndpoint(ctx, jane, input); return "ok"; } catch (e) { return (e as Error).message; } });
    expect(await tryCreate({ url: "http://hooks.example.com/ut", events: ["milestone.reached"] })).toMatch(/https/);
    expect(await tryCreate({ url: "https://169.254.169.254/latest", events: ["milestone.reached"] })).toMatch(/not allowed/);
    expect(await tryCreate({ url: "https://hooks.example.com/ut", events: ["webhook.test"] })).toMatch(/at least one/);
    expect(await tryCreate({ url: "https://hooks.example.com/ut", events: ["milestone.reached"], saasId: bobs })).toMatch(/Project not found/);
    const scoped = await t.run(async (ctx) => (await import("./webhooks")).createEndpoint(ctx, jane, { url: "https://hooks.example.com/acme", events: ["rank.changed"], saasId: acme }));
    expect(scoped.endpoint.saasId).toBe(acme);
    const list = await t.run(async (ctx) => (await import("./webhooks")).listEndpoints(ctx, jane));
    expect(list.length).toBe(2);
    expect(list.every((e) => !("secret" in e))).toBe(true);
    // Rotation returns a new secret once and invalidates the old one.
    const rotated = await t.run(async (ctx) => (await import("./webhooks")).rotateEndpointSecret(ctx, jane, created.endpoint.id));
    expect(rotated.secret).not.toBe(created.secret);
    const stored = await t.run((ctx) => ctx.db.get(created.endpoint.id));
    expect(stored?.secret).toBe(rotated.secret);
    // Bob cannot touch Jane's endpoint.
    const { bob } = await t.run(async (ctx) => ({ bob: (await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", "bob")).unique())!._id }));
    expect(await t.run(async (ctx) => { try { await (await import("./webhooks")).rotateEndpointSecret(ctx, bob, created.endpoint.id); return "ok"; } catch (e) { return (e as Error).message; } })).toMatch(/not found/);
    expect(await t.run(async (ctx) => { try { await (await import("./webhooks")).updateEndpoint(ctx, bob, created.endpoint.id, { status: "disabled" }); return "ok"; } catch (e) { return (e as Error).message; } })).toMatch(/not found/);
  });

  it("dispatches one delivery per (event, endpoint), respects subscriptions, project scope and disabled state, and dedupes", async () => {
    const { t, jane, acme, other } = await seed();
    const ep = await t.run(async (ctx) => (await import("./webhooks")).createEndpoint(ctx, jane, { url: "https://hooks.example.com/all", events: ["milestone.reached"] }));
    const scoped = await t.run(async (ctx) => (await import("./webhooks")).createEndpoint(ctx, jane, { url: "https://hooks.example.com/acme", events: ["milestone.reached", "growth.spike"], saasId: acme }));
    const spikeOnly = await t.run(async (ctx) => (await import("./webhooks")).createEndpoint(ctx, jane, { url: "https://hooks.example.com/spikes", events: ["growth.spike"] }));
    const dispatch = (saasId: Id<"saas">, type: "milestone.reached" | "growth.spike", key: string) => t.run(async (ctx) => dispatchEvent(ctx, { type, key, saas: (await ctx.db.get(saasId))!, data: { k: key } }));
    expect(await dispatch(acme, "milestone.reached", "users:1000")).toBe(2);
    expect(await dispatch(acme, "milestone.reached", "users:1000")).toBe(0);
    expect(await dispatch(other, "milestone.reached", "users:1000")).toBe(1);
    expect(await dispatch(acme, "growth.spike", "2026-09-03")).toBe(2);
    const rows = await t.run((ctx) => ctx.db.query("webhookDeliveries").collect());
    expect(rows.length).toBe(5);
    expect(new Set(rows.map((r) => r.deliveryId)).size).toBe(5);
    const acmeMilestone = rows.filter((r) => r.eventId === `evt_milestone_reached_${acme}_users_1000`);
    expect(acmeMilestone.map((r) => r.endpointId).sort()).toEqual([ep.endpoint.id, scoped.endpoint.id].sort());
    expect(acmeMilestone[0].payload).toMatchObject({ type: "milestone.reached", apiVersion: "2026-09-01", data: { project: { slug: "acme" }, k: "users:1000" } });
    expect(rows.filter((r) => r.endpointId === spikeOnly.endpoint.id).map((r) => r.type)).toEqual(["growth.spike"]);
    // Disabled endpoints receive nothing new.
    await t.run(async (ctx) => (await import("./webhooks")).updateEndpoint(ctx, jane, ep.endpoint.id, { status: "disabled" }));
    expect(await dispatch(other, "milestone.reached", "users:5000")).toBe(0);
    // Demo products never emit.
    await t.run((ctx) => ctx.db.patch(other, { isDemo: true }));
    expect(await dispatch(other, "milestone.reached", "users:9000")).toBe(0);
  });

  it("is wired into milestones, records attempts with the documented retry schedule and stops after 5", async () => {
    const { t, jane, acme } = await seed();
    const ep = await t.run(async (ctx) => (await import("./webhooks")).createEndpoint(ctx, jane, { url: "https://hooks.example.com/ut", events: ["milestone.reached"] }));
    await t.run((ctx) => addMilestones(ctx, acme, [{ key: "users:1000", kind: "users", metric: "totalUsers", value: 1000, title: "1,000 users", copy: "Acme crossed 1,000 users." }]));
    await t.run((ctx) => addMilestones(ctx, acme, [{ key: "users:1000", kind: "users", metric: "totalUsers", value: 1000, title: "1,000 users", copy: "Acme crossed 1,000 users." }]));
    const [d] = await t.run((ctx) => ctx.db.query("webhookDeliveries").collect());
    expect(d.type).toBe("milestone.reached");
    expect((d.payload as { data: { milestone: { value: number } } }).data.milestone.value).toBe(1000);
    expect((await t.run((ctx) => ctx.db.query("webhookDeliveries").collect())).length).toBe(1);
    // 5xx → retry with backoff; the fifth failure exhausts.
    const record = (ok: boolean, httpStatus: number, retryable: boolean) => t.mutation(internal.webhooks.recordAttempt, { deliveryId: d._id, ok, httpStatus, retryable, latencyMs: 12, error: ok ? undefined : `HTTP ${httpStatus}` });
    await record(false, 503, true);
    let row = (await t.run((ctx) => ctx.db.get(d._id)))!;
    expect(row).toMatchObject({ attempt: 1, status: "failed", httpStatus: 503 });
    expect(row.nextAttemptAt! - row.lastAttemptAt!).toBe(5 * 60_000);
    for (const _ of [2, 3, 4]) await record(false, 500, true);
    row = (await t.run((ctx) => ctx.db.get(d._id)))!;
    expect(row.attempt).toBe(4);
    expect(row.nextAttemptAt! - row.lastAttemptAt!).toBe(12 * 3_600_000);
    await record(false, 500, true);
    row = (await t.run((ctx) => ctx.db.get(d._id)))!;
    expect(row.status).toBe("exhausted");
    expect(row.nextAttemptAt).toBeUndefined();
    const endpoint = (await t.run((ctx) => ctx.db.get(ep.endpoint.id)))!;
    expect(endpoint.consecutiveFailures).toBe(5);
    expect(endpoint.lastStatus).toBe(500);
    // A 4xx is final on the first attempt; a 2xx clears the failure counter.
    await t.run(async (ctx) => dispatchEvent(ctx, { type: "milestone.reached", key: "users:5000", saas: (await ctx.db.get(acme))!, data: {} }));
    const d2 = (await t.run((ctx) => ctx.db.query("webhookDeliveries").collect())).find((x) => x.eventId.endsWith("users_5000"))!;
    await t.mutation(internal.webhooks.recordAttempt, { deliveryId: d2._id, ok: false, httpStatus: 404, retryable: false, latencyMs: 5, error: "HTTP 404" });
    expect((await t.run((ctx) => ctx.db.get(d2._id)))!.status).toBe("exhausted");
    await t.run(async (ctx) => dispatchEvent(ctx, { type: "milestone.reached", key: "users:10000", saas: (await ctx.db.get(acme))!, data: {} }));
    const d3 = (await t.run((ctx) => ctx.db.query("webhookDeliveries").collect())).find((x) => x.eventId.endsWith("users_10000"))!;
    await t.mutation(internal.webhooks.recordAttempt, { deliveryId: d3._id, ok: true, httpStatus: 200, retryable: false, latencyMs: 40 });
    expect((await t.run((ctx) => ctx.db.get(d3._id)))!).toMatchObject({ status: "success", attempt: 1, httpStatus: 200 });
    expect((await t.run((ctx) => ctx.db.get(ep.endpoint.id)))!.consecutiveFailures).toBe(0);
    const recent = await t.run(async (ctx) => (await import("./webhooks")).recentDeliveries(ctx, jane, ep.endpoint.id, 10, true));
    expect(recent.map((r) => r.status).sort()).toEqual(["exhausted", "exhausted"]);
  });

  it("sends a clearly marked test event and the dashboard API requires a signed-in profile", async () => {
    const { t, jane } = await seed();
    const ep = await t.run(async (ctx) => (await import("./webhooks")).createEndpoint(ctx, jane, { url: "https://hooks.example.com/ut", events: ["rank.changed"] }));
    const r = await t.run(async (ctx) => (await import("./webhooks")).sendTestEvent(ctx, jane, ep.endpoint.id));
    const d = (await t.run((ctx) => ctx.db.get(r.deliveryId)))!;
    expect(d.type).toBe("webhook.test");
    expect((d.payload as { test: boolean; data: { project: { slug: string } } }).test).toBe(true);
    expect((d.payload as { data: { project: { slug: string } } }).data.project.slug).toBe("acme");
    await expect(t.query(api.webhooks.list, {})).rejects.toThrow(/Not signed in/);
  });
});
