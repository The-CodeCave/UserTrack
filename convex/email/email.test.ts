import { describe, expect, it } from "vitest";
import { renderEmail, type TemplateData } from "./templates";
import { EMAIL_TYPES, allowedByPreferences, allowedByRecipientStatus, DEFAULT_PREFERENCES, isTransactional, type EmailType } from "./types";
import { signPrefsToken, verifyPrefsToken } from "./token";
import { verifySvixSignature } from "./webhookSig";
import { emailConfig, sendViaResend, ResendError } from "./resend";
import { monthlySummary, projectReport } from "../lib/emailRules";

const ctx = { siteUrl: "https://usertrack.dev", prefsUrl: "https://usertrack.dev/email/preferences?token=t", unsubscribeUrl: "https://usertrack.dev/email/preferences?token=t&unsubscribe=1" };
const report = monthlySummary("2026-08", [
  projectReport({ _id: "a", name: "Acme <b>", slug: "acme", isPublic: true, totalUsers: 1300 }, { day: "2026-07-31", totalUsers: 1000, newUsers: 0, rank: 14 }, [{ day: "2026-08-31", totalUsers: 1300, newUsers: 300, rank: 8, activatedUsers: 500 }], [{ title: "1,000 users", achievedAt: 1 }]),
  projectReport({ _id: "b", name: "Beta", slug: "beta", isPublic: false, totalUsers: 0 }, null, [], []),
], 0);

const samples: { [T in EmailType]: TemplateData[T] } = {
  welcome: { name: "Ada", verifyUrl: "https://usertrack.dev/api/auth/verify-email?token=x" },
  "verify-email": { name: "Ada", verifyUrl: "https://usertrack.dev/api/auth/verify-email?token=x" },
  "reset-password": { name: "Ada", resetUrl: "https://usertrack.dev/api/auth/reset-password/x" },
  "account-deleted": { name: "Ada" },
  "profile-reminder": { name: "Ada" },
  "missing-source": { name: "Ada", saasName: "Acme", saasId: "s1" },
  "source-connected": { saasName: "Acme", slug: "acme", saasId: "s1", totalUsers: 1234, trust: "verified", provider: "Clerk", isPublic: true },
  "source-failed": { saasName: "Acme", saasId: "s1", provider: "Clerk", error: "401 <script>alert(1)</script>", lastSuccessAt: 0, failures: 6 },
  "source-recovered": { saasName: "Acme", saasId: "s1", provider: "Clerk", totalUsers: 1240, downForMs: 3 * 86_400_000 },
  "user-milestone": { saasName: "Acme", slug: "acme", threshold: 10_000, totalUsers: 10_042, previousThreshold: 5_000, sinceMs: 40 * 86_400_000, isPublic: true },
  "rank-milestone": { saasName: "Acme", slug: "acme", threshold: 10, rank: 8, newUsers30d: 1842, growth30dPct: 18.4 },
  "growth-spike": { saasName: "Acme", slug: "acme", saasId: "s1", last24h: 84, average: 30, multiple: 2.8, days: 30, totalUsers: 5000 },
  "no-growth": { saasName: "Acme", slug: "acme", saasId: "s1", totalUsers: 500, newUsers30d: 40, days: 7 },
  "monthly-report": { name: "Ada", report },
  "weekly-digest": { week: "2026-W36", name: "Ada", own: [{ slug: "acme", name: "Acme", totalUsers: 100, newUsers7d: 10, rank: 3, prevRank: 5 }], followed: [], milestones: [{ title: "100 users", copy: "Acme crossed 100", slug: "acme" }], movers: [], trending: [] },
  "followed-update": { saasName: "Acme", slug: "acme", kind: "rank", headline: "Acme reached the Top 10", detail: "Now #8." },
};

describe("templates", () => {
  for (const type of EMAIL_TYPES) {
    it(`${type} renders with subject, CTA and brand`, () => {
      const r = renderEmail(type, samples[type] as never, ctx);
      expect(r.subject.length).toBeGreaterThan(5);
      expect(r.html).toContain("wordmark.png");
      expect(r.html).toContain("https://usertrack.dev");
      expect(r.text.length).toBeGreaterThan(10);
      if (isTransactional(type)) {
        expect(r.html).not.toContain("Unsubscribe");
        expect(r.html).not.toContain("email/preferences");
      } else {
        expect(r.html).toContain("Manage email preferences");
        expect(r.html).toContain(ctx.unsubscribeUrl.replace("&", "&amp;"));
      }
    });
  }
  it("escapes user-controlled strings", () => {
    const r = renderEmail("source-failed", samples["source-failed"], ctx);
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    const m = renderEmail("monthly-report", samples["monthly-report"], ctx);
    expect(m.html).toContain("Acme &lt;b&gt;");
    expect(m.html).not.toContain("Acme <b>");
  });
  it("monthly report includes every project, rank change and a no-data state", () => {
    const m = renderEmail("monthly-report", samples["monthly-report"], ctx);
    expect(m.subject).toBe("Your August growth report");
    expect(m.html).toContain("#14 → #8");
    expect(m.html).toContain("+300");
    expect(m.html).toContain("no data this month");
    expect(m.html).toContain("/app/reports/2026-08");
    expect(m.text).toContain("Beta\nno data this month");
  });
  it("welcome without verify link points to onboarding", () => {
    const r = renderEmail("welcome", { name: "Ada" }, ctx);
    expect(r.html).toContain("/app/onboarding");
    expect(r.html).not.toContain("Confirm email");
  });
  it("subjects follow the product voice", () => {
    expect(renderEmail("rank-milestone", { ...samples["rank-milestone"], threshold: 1, rank: 1 }, ctx).subject).toBe("Acme is #1 on UserTrack");
    expect(renderEmail("growth-spike", samples["growth-spike"], ctx).subject).toBe("Acme is growing 2.8x faster today");
    expect(renderEmail("user-milestone", samples["user-milestone"], ctx).subject).toBe("Acme just crossed 10,000 users");
  });
});

describe("preference model", () => {
  it("transactional mail ignores preferences and most suppression", () => {
    const off = { ...DEFAULT_PREFERENCES, productNudges: false, growthMilestones: false, growthAlerts: false, monthlyReport: false, rankingMilestones: false, weeklyDigest: false, followedSaasUpdates: false };
    expect(allowedByPreferences("reset-password", off)).toBe(true);
    expect(allowedByPreferences("source-failed", off)).toBe(true);
    expect(allowedByPreferences("user-milestone", off)).toBe(false);
    expect(allowedByPreferences("monthly-report", off)).toBe(false);
    expect(allowedByRecipientStatus("reset-password", "bounced")).toBe(true);
    expect(allowedByRecipientStatus("monthly-report", "bounced")).toBe(false);
    expect(allowedByRecipientStatus("source-failed", "complained")).toBe(false);
    expect(allowedByRecipientStatus("monthly-report", "active")).toBe(true);
  });
  it("weekly digest and followed updates are opt-in by default", () => {
    expect(DEFAULT_PREFERENCES.weeklyDigest).toBe(false);
    expect(DEFAULT_PREFERENCES.followedSaasUpdates).toBe(false);
    expect(DEFAULT_PREFERENCES.monthlyReport).toBe(true);
  });
});

describe("preference tokens", () => {
  it("round-trips, rejects tampering and expiry", async () => {
    const token = await signPrefsToken("secret", "user_1", 1000, 0);
    expect(await verifyPrefsToken("secret", token, 500)).toMatchObject({ userId: "user_1", scope: "prefs" });
    expect(await verifyPrefsToken("secret", token, 2000)).toBeNull();
    expect(await verifyPrefsToken("other", token, 500)).toBeNull();
    const [body, sig] = token.split(".");
    expect(await verifyPrefsToken("secret", `${body}x.${sig}`, 500)).toBeNull();
    expect(await verifyPrefsToken("secret", "garbage", 500)).toBeNull();
  });
});

describe("resend webhook signature", () => {
  const secret = "whsec_" + btoa("supersecretkey");
  async function sign(id: string, ts: string, body: string) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("supersecretkey"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
    return `v1,${btoa(String.fromCharCode(...mac))}`;
  }
  it("accepts a valid signature and rejects bad or stale ones", async () => {
    const now = 1_700_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const body = '{"type":"email.delivered"}';
    const sig = await sign("msg_1", ts, body);
    expect(await verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(true);
    expect(await verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,other ${sig}` }, body, now)).toBe(true);
    expect(await verifySvixSignature(secret, { id: "msg_2", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(await verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: sig }, body + " ", now)).toBe(false);
    expect(await verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: sig }, body, now + 10 * 60_000)).toBe(false);
    expect(await verifySvixSignature(secret, { id: null, timestamp: ts, signature: sig }, body, now)).toBe(false);
  });
});

describe("resend adapter", () => {
  it("is disabled without an API key and uses sane defaults", () => {
    expect(emailConfig({})).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: "re_x" })).toEqual({ apiKey: "re_x", from: "UserTrack <noreply@mail.usertrack.dev>", replyTo: "hello@usertrack.dev" });
  });
  it("maps provider errors to retryable / permanent", async () => {
    const cfg = { apiKey: "re_x", from: "a <a@b.c>" };
    const mail = { to: "x@y.z", subject: "s", html: "<p>h</p>", text: "t" };
    const fake = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;
    await expect(sendViaResend(cfg, mail, fake(429, "slow down"))).rejects.toMatchObject({ retryable: true, status: 429 });
    await expect(sendViaResend(cfg, mail, fake(422, "bad from"))).rejects.toMatchObject({ retryable: false });
    await expect(sendViaResend(cfg, mail, fake(200, '{"id":"em_1"}'))).resolves.toEqual({ id: "em_1" });
    expect(new ResendError("x", 500, true).retryable).toBe(true);
  });
  it("sends the idempotency key and headers", async () => {
    let captured: RequestInit | undefined;
    const fake = (async (_u: string, init: RequestInit) => { captured = init; return new Response('{"id":"em_2"}', { status: 200 }); }) as unknown as typeof fetch;
    await sendViaResend({ apiKey: "k", from: "f" }, { to: "x@y.z", subject: "s", html: "h", text: "t", idempotencyKey: "monthly-report:u:2026-08", headers: { "List-Unsubscribe": "<u>" } }, fake);
    expect((captured!.headers as Record<string, string>)["Idempotency-Key"]).toBe("monthly-report:u:2026-08");
    expect(JSON.parse(captured!.body as string).headers["List-Unsubscribe"]).toBe("<u>");
  });
});
