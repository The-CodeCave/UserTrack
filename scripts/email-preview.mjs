// Renders every email template with sample data to /tmp/ut-emails/<type>.html for eyeballing in a browser.
// Usage: node scripts/email-preview.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, logLevel: "error", configFile: false });
const { renderEmail } = await vite.ssrLoadModule("/convex/email/templates/index.ts");
const { EMAIL_TYPES } = await vite.ssrLoadModule("/convex/email/types.ts");
const { monthlySummary, projectReport } = await vite.ssrLoadModule("/convex/lib/emailRules.ts");

const ctx = { siteUrl: "https://usertrack.dev", prefsUrl: "https://usertrack.dev/email/preferences?token=demo", unsubscribeUrl: "https://usertrack.dev/email/preferences?token=demo&unsubscribe=1" };
const report = monthlySummary("2026-08", [
  projectReport({ _id: "a", name: "Project A", slug: "project-a", isPublic: true, totalUsers: 11_842 }, { day: "2026-07-31", totalUsers: 10_000, newUsers: 40, rank: 14, activatedUsers: 4_100 }, [
    { day: "2026-08-01", totalUsers: 10_090, newUsers: 90, rank: 14, activatedUsers: 4_140 },
    { day: "2026-08-15", totalUsers: 10_900, newUsers: 310, rank: 11, activatedUsers: 4_560 },
    { day: "2026-08-31", totalUsers: 11_842, newUsers: 61, rank: 8, activatedUsers: 5_010 },
  ], [{ title: "10,000 users", achievedAt: 1 }, { title: "Top 10 on UserTrack", achievedAt: 2 }]),
  projectReport({ _id: "b", name: "Project B", slug: "project-b", isPublic: true, totalUsers: 4_444 }, { day: "2026-07-31", totalUsers: 4_123, newUsers: 5 }, [{ day: "2026-08-31", totalUsers: 4_444, newUsers: 321 }], []),
  projectReport({ _id: "c", name: "Project C", slug: "project-c", isPublic: false, totalUsers: 0 }, null, [], []),
], Date.now());
const samples = {
  welcome: { name: "Ada", verifyUrl: "https://usertrack.dev/api/auth/verify-email?token=demo" },
  "verify-email": { name: "Ada", verifyUrl: "https://usertrack.dev/api/auth/verify-email?token=demo" },
  "reset-password": { name: "Ada", resetUrl: "https://usertrack.dev/api/auth/reset-password/demo" },
  "profile-reminder": { name: "Ada" },
  "missing-source": { name: "Ada", saasName: "Project A", saasId: "s1" },
  "source-connected": { saasName: "Project A", slug: "project-a", saasId: "s1", totalUsers: 10_042, trust: "verified", provider: "Clerk", isPublic: true },
  "source-failed": { saasName: "Project A", saasId: "s1", provider: "Clerk", error: "401 Unauthorized: invalid secret key", lastSuccessAt: Date.now() - 2 * 86_400_000, failures: 6 },
  "source-recovered": { saasName: "Project A", saasId: "s1", provider: "Clerk", totalUsers: 10_120, downForMs: 3 * 86_400_000 },
  "user-milestone": { saasName: "Project A", slug: "project-a", threshold: 10_000, totalUsers: 10_042, previousThreshold: 5_000, sinceMs: 41 * 86_400_000, isPublic: true },
  "rank-milestone": { saasName: "Project A", slug: "project-a", threshold: 10, rank: 8, newUsers30d: 1_842, growth30dPct: 18.4 },
  "growth-spike": { saasName: "Project A", slug: "project-a", saasId: "s1", last24h: 84, average: 30, multiple: 2.8, days: 30, totalUsers: 10_042 },
  "no-growth": { saasName: "Project B", slug: "project-b", saasId: "s2", totalUsers: 4_444, newUsers30d: 40, days: 7 },
  "monthly-report": { name: "Ada", report },
  "weekly-digest": { week: "2026-W36", name: "Ada", own: [{ slug: "project-a", name: "Project A", totalUsers: 11_842, newUsers7d: 312, rank: 8, prevRank: 11, trendingRank: 4 }], followed: [{ slug: "x", name: "Followed SaaS", totalUsers: 900, newUsers7d: 70, rank: 20 }], milestones: [{ title: "10,000 users", copy: "Project A just crossed 10,000 users on UserTrack.", slug: "project-a" }], movers: [{ slug: "y", name: "Mover", rank: 5, prevRank: 12, newUsers7d: 400 }], trending: [{ slug: "z", name: "Hot SaaS", trendingRank: 1, newUsers7d: 1_200 }] },
  "followed-update": { saasName: "Project A", slug: "project-a", kind: "rank", headline: "Project A reached the Top 10 on UserTrack", detail: "Now #8 by verified new users in the last 30 days." },
};

await mkdir("/tmp/ut-emails", { recursive: true });
for (const type of EMAIL_TYPES) {
  const r = renderEmail(type, samples[type], ctx);
  await writeFile(`/tmp/ut-emails/${type}.html`, r.html);
  await writeFile(`/tmp/ut-emails/${type}.txt`, `Subject: ${r.subject}\nPreheader: ${r.preheader}\n\n${r.text}`);
  console.log(`${type.padEnd(18)} ${r.subject}`);
}
await vite.close();
