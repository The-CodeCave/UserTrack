import { afterEach, describe, expect, it, vi } from "vitest";
import { aggregateConversion, pageAll, subjectFrom, type SubRecord } from "./conversion";
import { stripe, toRecord as stripeRecord } from "./stripe";
import { revenuecat } from "./revenuecat";
import { paddle, toRecord as paddleRecord } from "./paddle";
import { lemonsqueezy, subRecord as lsRecord, orderRecord } from "./lemonsqueezy";
import { chargebee, toRecord as cbRecord } from "./chargebee";
import { endpoint, parseIdentities } from "./endpoint";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 2);

describe("aggregateConversion", () => {
  const records: SubRecord[] = [
    { subject: "u1", state: "active", paidAt: NOW - 3 * DAY },                      // active paid, converted 3 days ago
    { subject: "u2", state: "trial", trialAt: NOW - 2 * DAY },                      // trialing
    { subject: "u3", state: "canceled", paidAt: NOW - 100 * DAY },                  // churned
    { subject: "u4", state: "incomplete" },                                          // never paid
    { subject: "u1", state: "canceled", paidAt: NOW - 400 * DAY },                  // duplicate subject, older sub
    { subject: "u5", state: "past_due", paidAt: NOW - 20 * DAY },                   // still has access
    { subject: "$anon", state: "active", paidAt: NOW - DAY, anonymous: true },      // anonymous, counted but no identity
  ];
  it("active_paid counts only currently paid subjects, once each", () => {
    const m = aggregateConversion(records, "active_paid", NOW);
    expect(m.convertedUsers).toBe(3);
    expect(m.trialUsers).toBe(1);
    expect(m.newTrials7d).toBe(1);
    // u1's first payment was 400 days ago (older subscription wins), so only the anonymous subject converted this week.
    expect(m.newConverted24h).toBe(1);
    expect(m.newConverted7d).toBe(1);
    expect(m.newConverted30d).toBe(2);
    expect(m.identities?.find((i) => i.stage === "converted")?.ids.map((x) => x.id).sort()).toEqual(["u1", "u5"]);
    expect(m.identities?.find((i) => i.stage === "trial")?.ids).toEqual([{ id: "u2", at: NOW - 2 * DAY }]);
  });
  it("ever_paid includes churned subjects and uses the earliest payment", () => {
    const m = aggregateConversion(records, "ever_paid", NOW);
    expect(m.convertedUsers).toBe(4);
    const u1 = m.identities?.find((i) => i.stage === "converted")?.ids.find((x) => x.id === "u1");
    expect(u1?.at).toBe(NOW - 400 * DAY);
  });
  it("handles empty input and zero values", () => {
    const m = aggregateConversion([], "active_paid", NOW);
    expect(m).toMatchObject({ convertedUsers: 0, trialUsers: 0, newConverted30d: 0, newTrials30d: 0 });
  });
  it("a trial that already converted is not a trial user", () => {
    const m = aggregateConversion([{ subject: "x", state: "trial", trialAt: NOW }, { subject: "x", state: "active", paidAt: NOW }], "active_paid", NOW);
    expect(m.trialUsers).toBe(0);
    expect(m.convertedUsers).toBe(1);
  });
});

describe("subjectFrom / pageAll", () => {
  it("prefers the product's own user id from metadata", () => {
    expect(subjectFrom({ userId: "usr_9" }, "cus_1")).toBe("usr_9");
    expect(subjectFrom({ user_id: 42 }, "cus_1")).toBe("42");
    expect(subjectFrom({}, "cus_1")).toBe("cus_1");
  });
  it("stops at the page cap and reports incompleteness", async () => {
    let calls = 0;
    const res = await pageAll(async () => { calls++; return { items: [1], next: "more" }; }, 3);
    expect(calls).toBe(3);
    expect(res).toEqual({ items: [1, 1, 1], complete: false });
  });
});

describe("Stripe", () => {
  it("validates restricted keys and modes", () => {
    expect(stripe.validate({ secretKey: "rk_live_abc" }, "conversion")).toMatchObject({ ok: true, config: { mode: "active_paid" } });
    expect(stripe.validate({ secretKey: "pk_live_abc" }, "conversion").ok).toBe(false);
    expect(stripe.validate({ secretKey: "rk_live_abc", mode: "nope" }, "conversion").ok).toBe(false);
  });
  it("maps subscription states: active, trial, canceled, unpaid customer", () => {
    const now = NOW;
    const active = stripeRecord({ id: "s1", status: "active", customer: "cus_a", start_date: (now - 10 * DAY) / 1000, metadata: { userId: "u_a" } }, now);
    expect(active).toMatchObject({ subject: "u_a", state: "active", paidAt: now - 10 * DAY });
    const trialing = stripeRecord({ id: "s2", status: "trialing", customer: "cus_b", start_date: (now - DAY) / 1000, trial_start: (now - DAY) / 1000, trial_end: (now + 6 * DAY) / 1000 }, now);
    expect(trialing).toMatchObject({ subject: "cus_b", state: "trial", paidAt: undefined, trialAt: now - DAY });
    const afterTrial = stripeRecord({ id: "s3", status: "active", customer: "cus_c", start_date: (now - 20 * DAY) / 1000, trial_start: (now - 20 * DAY) / 1000, trial_end: (now - 13 * DAY) / 1000 }, now);
    expect(afterTrial.paidAt).toBe(now - 13 * DAY);
    const canceledInTrial = stripeRecord({ id: "s4", status: "canceled", customer: "cus_d", start_date: (now - 5 * DAY) / 1000, trial_end: (now + 2 * DAY) / 1000, ended_at: (now - DAY) / 1000 }, now);
    expect(canceledInTrial.paidAt).toBeUndefined();
    const incomplete = stripeRecord({ id: "s5", status: "incomplete", customer: "cus_e" }, now);
    expect(incomplete.paidAt).toBeUndefined();
    expect(aggregateConversion([active, trialing, afterTrial, canceledInTrial, incomplete], "active_paid", now).convertedUsers).toBe(2);
  });
  it("fetches by status with a restricted key and never reads amounts", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(url); return new Response(JSON.stringify({ data: url.includes("status=active") ? [{ id: "s1", status: "active", customer: "cus_1", start_date: (NOW - DAY) / 1000 }] : [], has_more: false }), { status: 200 }); }));
    const m = await stripe.fetch({ secretKey: "rk_live_x", mode: "active_paid" }, "conversion");
    expect(m.convertedUsers).toBe(1);
    expect(urls.every((u) => u.startsWith("https://api.stripe.com/v1/subscriptions?status="))).toBe(true);
    expect(urls.some((u) => u.includes("invoices") || u.includes("charges") || u.includes("expand"))).toBe(false);
    expect(JSON.stringify(m)).not.toMatch(/mrr|amount|currency/);
  });
  afterEach(() => vi.unstubAllGlobals());
});

describe("RevenueCat", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("only accepts active_paid and reads overview metrics without persisting revenue", async () => {
    expect(revenuecat.validate({ apiKey: "sk_abc", projectId: "proj1", mode: "ever_paid" }, "conversion").ok).toBe(false);
    expect(revenuecat.validate({ apiKey: "sk_abc", projectId: "proj1" }, "conversion")).toMatchObject({ ok: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ metrics: [{ id: "active_trials", value: 821 }, { id: "active_subscriptions", value: 347 }, { id: "mrr", value: 12345 }, { id: "revenue", value: 999 }, { id: "new_customers", value: 5000 }] }), { status: 200 })));
    const m = await revenuecat.fetch({ apiKey: "sk_abc", projectId: "proj1", mode: "active_paid" }, "conversion");
    expect(m).toEqual({ convertedUsers: 347, trialUsers: 821, conversionMode: "active_paid" });
  });
  it("does not report identities (anonymous app user ids are never registered users)", () => {
    expect(revenuecat.capabilities).not.toContain("identity");
  });
});

describe("Paddle / Lemon Squeezy / Chargebee records", () => {
  it("paddle: billed once = converted, trialing = trial", () => {
    expect(paddleRecord({ id: "p1", status: "active", customer_id: "ctm_1", first_billed_at: "2026-08-01T00:00:00Z", custom_data: { userId: "u1" } })).toMatchObject({ subject: "u1", state: "active", paidAt: Date.parse("2026-08-01T00:00:00Z") });
    expect(paddleRecord({ id: "p2", status: "trialing", customer_id: "ctm_2", started_at: "2026-08-30T00:00:00Z", first_billed_at: null })).toMatchObject({ subject: "ctm_2", state: "trial", paidAt: undefined });
    expect(paddle.validate({ apiKey: "short" }, "conversion").ok).toBe(false);
  });
  it("lemon squeezy: subscriptions + paid orders, unpaid orders ignored", () => {
    expect(lsRecord({ id: "1", attributes: { customer_id: 7, status: "active", created_at: "2026-07-01T00:00:00Z", trial_ends_at: "2026-07-08T00:00:00Z" } }, NOW)).toMatchObject({ subject: "7", state: "active", paidAt: Date.parse("2026-07-08T00:00:00Z") });
    expect(lsRecord({ id: "2", attributes: { customer_id: 8, status: "on_trial", created_at: "2026-09-01T00:00:00Z" } }, NOW)).toMatchObject({ state: "trial", paidAt: undefined });
    expect(orderRecord({ id: "3", attributes: { customer_id: 9, status: "paid", created_at: "2026-08-20T00:00:00Z" } })).toMatchObject({ subject: "9", paidAt: Date.parse("2026-08-20T00:00:00Z") });
    expect(orderRecord({ id: "4", attributes: { customer_id: 9, status: "refunded" } })).toBeNull();
    expect(lemonsqueezy.validate({ apiKey: "x".repeat(30), storeId: "abc" }, "conversion").ok).toBe(false);
  });
  it("chargebee: activated_at is the conversion event", () => {
    expect(cbRecord({ id: "c1", customer_id: "cust", status: "active", activated_at: 1_756_000_000, trial_start: 1_755_000_000, meta_data: { user_id: "u9" } })).toMatchObject({ subject: "u9", state: "active", paidAt: 1_756_000_000_000, trialAt: 1_755_000_000_000 });
    expect(cbRecord({ id: "c2", customer_id: "cust2", status: "in_trial", trial_start: 1_756_000_000 })).toMatchObject({ state: "trial", paidAt: undefined });
    expect(chargebee.validate({ site: "https://acme.chargebee.com", apiKey: "live_" + "k".repeat(20) }, "conversion")).toMatchObject({ ok: true, config: { site: "acme" } });
  });
});

describe("endpoint conversion + identities", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("accepts convertedUsers (or legacy payingUsers) and parses identities without emails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ payingUsers: 61, trialUsers: 12, mode: "ever_paid", identities: { converted: ["u1", { id: "u2", at: "2026-08-01T00:00:00Z" }, "someone@example.com"], trial: [{ id: 5 }] } }), { status: 200 })));
    const m = await endpoint.fetch({ url: "https://acme.com/api/usertrack", token: "" }, "conversion");
    expect(m).toMatchObject({ convertedUsers: 61, trialUsers: 12, conversionMode: "ever_paid" });
    expect(m.identities).toEqual([
      { stage: "trial", ids: [{ id: "5", at: undefined }], complete: true },
      { stage: "converted", ids: [{ id: "u1" }, { id: "u2", at: Date.parse("2026-08-01T00:00:00Z") }], complete: true },
    ]);
  });
  it("signed_up identities only for the users role", () => {
    expect(parseIdentities({ identities: { signedUp: ["a", "b"], converted: ["c"] } }, "users")).toEqual([{ stage: "signed_up", ids: [{ id: "a" }, { id: "b" }], complete: true }]);
    expect(parseIdentities({}, "users")).toBeUndefined();
  });
});
