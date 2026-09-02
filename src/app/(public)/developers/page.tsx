import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Public API",
  description: "UserTrack public API v1: SaaS profiles, growth history, milestones, leaderboards and categories as JSON. Plus embeddable SVG badges.",
  alternates: { canonical: `${SITE_URL}/developers` },
};

const ENDPOINTS = [
  { path: "/api/v1/saas/{slug}", desc: "Public profile, current metrics, ranks, trust label and milestones." },
  { path: "/api/v1/saas/{slug}/history?range=30d", desc: "Growth history. range ∈ 24h · 7d · 30d · 90d · 1y · all." },
  { path: "/api/v1/saas/{slug}/milestones", desc: "Persisted milestones (10 users … 1M, best day, top 10, streaks)." },
  { path: "/api/v1/leaderboard?board=trending&window=7d&category=ai", desc: "Any board with the same filters as the website. Includes movement." },
  { path: "/api/v1/categories", desc: "Categories with counts." },
  { path: "/api/badge/{slug}.svg?type=users|growth|trending|verified", desc: "Embeddable SVG badge, cached at the edge. theme=dark|light." },
];

export default function DevelopersPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <SectionLabel>Developers</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Public API v1</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Read-only JSON for everything that is public on UserTrack. No key needed. 60 requests per minute per IP, CORS enabled, responses cached for 5 minutes. Only additive changes within v1.</p>

      <Panel className="mt-8 p-0">
        {ENDPOINTS.map((e) => (
          <div key={e.path} className="border-b border-line p-4 last:border-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-sm"><span className="text-pink">GET</span><span className="break-all">{e.path}</span></div>
            <div className="mt-1 text-xs text-muted-foreground">{e.desc}</div>
          </div>
        ))}
      </Panel>

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        <Panel className="p-4">
          <div className="text-label">Example</div>
          <pre className="mt-2 overflow-x-auto font-mono text-[12px] leading-relaxed text-muted-foreground">{`curl ${SITE_URL}/api/v1/saas/demo-pixelpost

{
  "data": {
    "slug": "demo-pixelpost",
    "name": "Pixelpost",
    "trust": { "level": "verified", "label": "Verified", "score": 82 },
    "metrics": { "totalUsers": 46882, "newUsers30d": 40121, "growth30dPct": 593.4, ... },
    "ranks": { "leaderboard": 3, "trending": 1 },
    "urls": { "page": "…/s/demo-pixelpost", "badge": "…/api/badge/demo-pixelpost.svg" }
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T12:00:00.000Z" }
}`}</pre>
        </Panel>
        <Panel className="p-4">
          <div className="text-label">Errors &amp; limits</div>
          <pre className="mt-2 overflow-x-auto font-mono text-[12px] leading-relaxed text-muted-foreground">{`{ "error": { "code": "not_found", "message": "…" } }

codes: bad_request · not_found · rate_limited · internal
headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After`}</pre>
          <div className="mt-3 text-xs text-muted-foreground">Only public-safe fields are returned: never credentials, owner ids, internal trust state or anomaly flags. Traffic and revenue appear only when the founder opted in.</div>
        </Panel>
      </div>

      <Panel className="mt-3 p-4">
        <div className="text-label">Badge embed</div>
        <pre className="mt-2 overflow-x-auto font-mono text-[12px] leading-relaxed text-muted-foreground">{`<a href="${SITE_URL}/s/your-slug">
  <img src="${SITE_URL}/api/badge/your-slug.svg?type=users" alt="Your SaaS on UserTrack" height="28">
</a>`}</pre>
        <div className="mt-2 text-xs text-muted-foreground">Founders get a copy-paste version on their <Link href="/app" className="underline underline-offset-4">dashboard</Link>. Full reference in <code className="font-mono">docs/API.md</code> in the repository.</div>
      </Panel>
    </div>
  );
}
