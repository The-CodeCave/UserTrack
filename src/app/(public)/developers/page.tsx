import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Snippet } from "@/components/public/embed-badge";
import { SnippetTabs } from "@/components/public/developers/snippet-tabs";
import { SETUP_WORKFLOW, TOOLS } from "@/lib/mcp/tools";
import { AGENT_PROMPT, MCP_URL, mcpSnippets } from "@/lib/mcp/snippets";
import { PLANS, SCOPES } from "@convex/lib/tokens";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Developers — Public API & MCP",
  description: "UserTrack is the growth data layer for SaaS. Read growth metrics, history, milestones and leaderboards over a free JSON API, or let your AI agent add your SaaS to UserTrack through MCP in 60 seconds.",
  alternates: { canonical: `${SITE_URL}/developers` },
};

const API = `${SITE_URL}/api/v1`;
const { api: API_PLAN, mcp: MCP_PLAN, anonymous: ANON } = PLANS.free;

const NAV = [
  ["#overview", "Overview"],
  ["#quickstart", "Quickstart"],
  ["#api", "Public API"],
  ["#mcp", "MCP"],
  ["#webhooks", "Webhooks"],
  ["#examples", "Examples"],
];

const ENDPOINTS = [
  { path: "/saas/{slug}", params: "—", desc: "Full public profile: metrics, trust, ranks, owner, URLs and the 8 latest milestones." },
  { path: "/saas/{slug}/metrics", params: "—", desc: "Compact metrics view for badges, widgets and newsletters." },
  { path: "/saas/{slug}/history", params: "range = 24h · 7d · 30d · 90d · 1y · all (default 30d)", desc: "Time series of total, new, activated (and, when published, visitors / converted) users with storage-aware resolution and explicit gaps." },
  { path: "/saas/{slug}/rank-history", params: "kind = leaderboard · trending · window · days (7–730, default 90)", desc: "Stored daily leaderboard / trending positions, plus current, best and 7-days-ago position." },
  { path: "/saas/{slug}/benchmark-history", params: "weeks (4–52, default 26)", desc: "Weekly benchmark standings, top-quarter positions only; 404 when the owner does not publish benchmarks." },
  { path: "/saas/{slug}/milestones", params: "—", desc: "The 8 most recent milestones, newest first." },
  { path: "/saas/{slug}/funnel", params: "timeframe = 7d · 30d · 90d (default 30d)", desc: "Lifecycle funnel Reached → Signed up → Activated → Trial → Converted: only published stages, rates, per-stage provenance and freshness." },
  { path: "/saas/{slug}/engagement", params: "—", desc: "Activated users, activation rate and retention when published." },
  { path: "/saas/{slug}/conversion", params: "—", desc: "Converted users and Signup / Activated / Trial → Converted rates when published. Never amounts." },
  { path: "/saas/{slug}/cohorts", params: "—", desc: "Monthly signup cohorts traced through the lifecycle from pseudonymous identities, with identity quality." },
  { path: "/saas/{slug}/benchmarks", params: "—", desc: "Public benchmark statement (top-quarter positions only)." },
  { path: "/discover", params: "category · limit", desc: "Discovery sections (trending, fastest today / week / month, new & rising, recently verified, biggest movers, hidden gems, mobile) and the activity feed, narrowed by category." },
  { path: "/compare", params: "s = slug,slug · days = 7 · 30 · 90 · 365 · all", desc: "Compare 2–4 products: absolute and indexed daily series." },
  { path: "/leaderboard", params: "board · window · category · size · platform · verified · limit (1–100, default 50)", desc: "Any board with the same filters as the website; rows carry position and movement (movers: the stored 7-day climb)." },
  { path: "/trending", params: "same as /leaderboard", desc: "Alias for /leaderboard?board=trending." },
  { path: "/categories", params: "—", desc: "Categories that have at least one public product, with counts." },
  { path: "/datasets/{name}", params: "trending · fastest-growing · new-and-rising · hidden-gems · movers; window · category · platform · limit · cursor · format = json · csv", desc: "Public datasets as JSON or CSV download (≤ 100 rows per window, cursor paging, methodology link in meta)." },
  { path: "/datasets/categories/{slug}", params: "board (default most-new) + the dataset params", desc: "One category as a dataset." },
  { path: "/datasets/rankings/history", params: "period = YYYY-MM · board · category · format", desc: "Frozen monthly rankings; without period, the index of available periods." },
  { path: "/following", params: "days (1–90) · limit (1–200) — API key required", desc: "Your watchlist: followed products with 7-day movement, followed founders and your personal feed. Private to the key owner, never public." },
  { path: "/users/{username}", params: "—", desc: "Public founder profile with links and their public SaaS projects." },
  { path: "/users/{username}/history", params: "range = 7d · 30d · 90d · 1y · all", desc: "Aggregate user growth across the founder's public projects." },
];

const ERRORS = [
  ["400", "bad_request", "Invalid query parameter; the message lists accepted values."],
  ["401", "unauthorized", "Key has the wrong format or does not exist — or /following was called without a key."],
  ["401", "revoked", "Key was revoked in the dashboard."],
  ["401", "expired", "Key passed its expiry date."],
  ["403", "forbidden", "Token is missing the required scope (MCP only)."],
  ["404", "not_found", "Unknown slug or username, or the product is private."],
  ["429", "rate_limited", "Limit exceeded; wait for Retry-After seconds."],
  ["500", "internal", "Unexpected error on our side."],
];

const EXAMPLES = [
  { ask: "How did my SaaS perform this week?", tools: ["usertrack_get_projects", "usertrack_get_metrics { timeframe: \"7d\" }", "usertrack_get_rank"], out: "New users vs the previous 7 days, growth %, activation, leaderboard and trending movement." },
  { ask: "Compare my projects.", tools: ["usertrack_get_projects", "usertrack_get_metrics (per project)", "usertrack_get_growth_history { range: \"30d\" }"], out: "A side-by-side table of totals, 30-day growth and ranks, plus a chart-ready series per project." },
  { ask: "Write a post about my biggest milestone.", tools: ["usertrack_get_milestones", "usertrack_get_share_url"], out: "The milestone copy, its share page and OG image URL, ready to paste into X or LinkedIn." },
  { ask: "Follow the products I compete with and tell me what moved this week.", tools: ["usertrack_discover { category: \"developer-tools\" }", "usertrack_follow_project { slug }", "usertrack_get_watchlist { days: 7 }"], out: "Your watchlist with 7-day leaderboard and trending movement, plus the personal feed of milestones, spikes and rank jumps." },
  { ask: "Ping Slack when we hit a milestone.", tools: ["usertrack_get_webhooks", "usertrack_create_webhook { url, events: [\"milestone.reached\"] }", "usertrack_test_webhook"], out: "A signed endpoint, its secret handed to you once, and a test delivery you can inspect with usertrack_get_webhook_deliveries." },
];

const METRICS_EXAMPLE = `{
  "data": {
    "slug": "acme",
    "name": "Acme",
    "verification": "verified",
    "metrics": {
      "totalUsers": 12481,
      "newUsers24h": 41,
      "newUsers7d": 312,
      "newUsers30d": 1922,
      "growth7dPercentage": 2.6,
      "growth30dPercentage": 18.2,
      "activatedUsers": 4870,
      "activationRatePercentage": 39,
      "trendingRank": 9,
      "overallRank": 4
    },
    "updatedAt": "2026-09-02T08:00:00.000Z",
    "urls": {
      "page": "${SITE_URL}/s/acme",
      "badge": "${SITE_URL}/api/badge/acme.svg"
    }
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}`;

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto border border-line bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground/90">{children}</pre>;
}

function H2({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="scroll-mt-28" id={id}>
      <SectionLabel>{label}</SectionLabel>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{children}</h2>
    </div>
  );
}

function Row({ cols, head = false, className = "" }: { cols: ReactNode[]; head?: boolean; className?: string }) {
  return (
    <div className={`grid gap-x-4 gap-y-1 border-b border-line p-3 text-sm last:border-0 *:min-w-0 *:break-words ${head ? "text-label" : ""} ${className}`}>
      {cols.map((c, i) => <div key={i} className="min-w-0">{c}</div>)}
    </div>
  );
}

export default function DevelopersPage() {
  const snippets = mcpSnippets();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <SectionLabel>Developers</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">The growth data layer for SaaS.</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        Every public product on UserTrack is available as JSON, and every founder can let an AI agent add, connect and report on their SaaS through MCP. Same numbers, same rules, three interfaces.
      </p>

      <nav aria-label="On this page" className="sticky top-14 z-30 -mx-4 mt-8 border-y border-line bg-background/90 px-4 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className="shrink-0 px-2 py-1 hover:text-foreground">{label}</a>
          ))}
        </div>
      </nav>

      {/* Overview */}
      <section className="mt-12">
        <H2 id="overview" label="Overview">One domain layer, three surfaces</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-3 *:min-w-0">
          {[
            ["Website", "Public growth pages, leaderboards, trending, milestones and share cards. Numbers are synced every 4 hours from read-only data sources — never typed in."],
            ["Public API", `Read-only JSON for everything that is public. No key needed; an API key raises the limit to ${API_PLAN.perDay.toLocaleString()} requests per day.`],
            ["MCP", `${TOOLS.length} tools for Claude Code, Cursor, Codex, VS Code or any MCP client. Your agent creates the project, connects the data source (native Better Auth plugin included), verifies it and publishes.`],
          ].map(([title, body]) => (
            <Panel key={title} className="p-4">
              <div className="text-label">{title}</div>
              <div className="mt-2 text-sm text-muted-foreground">{body}</div>
            </Panel>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          The website, the API and the MCP server call the same project, integration and metrics functions in the backend. Nothing is duplicated, so an agent and a founder see exactly the same data.
        </p>
      </section>

      {/* Quickstart */}
      <section className="mt-16">
        <H2 id="quickstart" label="Quickstart">Set up with AI in 60 seconds</H2>
        <div className="mt-6 space-y-3">
          <Panel className="p-4">
            <div className="flex items-baseline gap-3"><span className="font-mono text-pink">01</span><div className="font-medium">Generate an MCP token</div></div>
            <div className="mt-2 text-sm text-muted-foreground">
              Sign in and open <Link href="/app/developer" className="font-mono underline underline-offset-4">/app/developer</Link>. Create an MCP token; it starts with <code className="font-mono">ut_mcp_</code> and is shown once. Keep the default scopes for onboarding.
            </div>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-baseline gap-3"><span className="font-mono text-pink">02</span><div className="font-medium">Add UserTrack MCP to your agent</div></div>
            <div className="mt-3"><SnippetTabs snippets={snippets} /></div>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-baseline gap-3"><span className="font-mono text-pink">03</span><div className="font-medium">Open your SaaS repository</div></div>
            <div className="mt-2 text-sm text-muted-foreground">Start the agent inside the repository of the product you want to track. It will detect your auth stack from <code className="font-mono">package.json</code> and env files.</div>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-baseline gap-3"><span className="font-mono text-pink">04</span><div className="font-medium">Tell your agent</div></div>
            <div className="mt-3"><Snippet label="Prompt" text={AGENT_PROMPT} /></div>
            <div className="mt-2 text-xs text-muted-foreground">Also available as the MCP prompt <code className="font-mono">add_project_to_usertrack</code>. The agent asks you for any credential it cannot find in the repo.</div>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-baseline gap-3"><span className="font-mono text-pink">05</span><div className="font-medium">Done</div></div>
            <div className="mt-2 text-sm text-muted-foreground">
              The agent hands you the public URL, e.g. <span className="break-all font-mono">{SITE_URL}/s/your-slug</span>. The first sync lands within seconds; the page updates every 4 hours from then on.
            </div>
          </Panel>
        </div>
      </section>

      {/* Public API */}
      <section className="mt-16">
        <H2 id="api" label="Public API v1">Read-only JSON for everything public</H2>

        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-label">Base URL</div>
            <div className="mt-2 break-all font-mono text-sm">{API}</div>
            <div className="mt-2 text-xs text-muted-foreground">JSON, UTF-8, ISO 8601 timestamps. CORS enabled for browsers. Only additive changes within v1.</div>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">Authentication</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Optional. Create an API key at <Link href="/app/developer" className="font-mono underline underline-offset-4">/app/developer</Link> (prefix <code className="font-mono">ut_api_</code>, shown once) and send it as <code className="font-mono">Authorization: Bearer</code> or <code className="font-mono">X-API-Key</code>.
            </div>
          </Panel>
        </div>

        <Panel className="mt-3 p-0">
          <Row head cols={["Endpoint", "Query params", "Returns"]} className="hidden md:grid md:grid-cols-[1.1fr_1fr_1.4fr]" />
          {ENDPOINTS.map((e) => (
            <Row
              key={e.path}
              className="md:grid-cols-[1.1fr_1fr_1.4fr]"
              cols={[
                <span key="p" className="break-all font-mono text-sm"><span className="text-pink">GET</span> {e.path}</span>,
                <span key="q" className="font-mono text-xs text-muted-foreground">{e.params}</span>,
                <span key="d" className="text-xs text-muted-foreground">{e.desc}</span>,
              ]}
            />
          ))}
        </Panel>
        <p className="mt-2 text-xs text-muted-foreground">
          Leaderboard values: board = trending · fastest · most-users · most-new · most-activated · activation-rate · new-rising · hidden-gems · movers · best-conversion · best-trial-conversion · converted-growth; window = 24h · 7d · 30d; size = 0-100 · 100-1k · 1k-10k · 10k-100k · 100k+; platform = web · mobile · hybrid; verified = true (default) · false. Datasets share the API rate-limit buckets (CSV included) and are capped at 100 rows per window.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-label">curl</div>
            <div className="mt-2"><Code>{`curl ${API}/saas/acme/metrics

# with an API key
curl -H "Authorization: Bearer ut_api_…" \\
  "${API}/leaderboard?board=trending&window=7d&limit=10"`}</Code></div>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">JavaScript</div>
            <div className="mt-2"><Code>{`const res = await fetch("${API}/saas/acme/metrics", {
  headers: { Authorization: \`Bearer \${process.env.USERTRACK_API_KEY}\` },
});
const { data, meta } = await res.json();
console.log(data.metrics.totalUsers, meta.generatedAt);`}</Code></div>
          </Panel>
        </div>

        <Panel className="mt-3 p-4">
          <div className="text-label">Example response · GET /saas/{"{slug}"}/metrics</div>
          <div className="mt-2"><Code>{METRICS_EXAMPLE}</Code></div>
        </Panel>

        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-0">
            <div className="p-4 pb-2 text-label">Errors</div>
            <div className="px-4 pb-3"><Code>{`{ "error": { "code": "not_found", "message": "…" } }`}</Code></div>
            {ERRORS.map(([status, code, desc]) => (
              <Row key={code} className="grid-cols-[3rem_8rem_1fr]" cols={[<span key="s" className="font-mono text-xs">{status}</span>, <span key="c" className="font-mono text-xs text-pink">{code}</span>, <span key="d" className="text-xs text-muted-foreground">{desc}</span>]} />
            ))}
          </Panel>
          <Panel className="p-0">
            <div className="p-4 pb-2 text-label">Rate limits</div>
            <Row head cols={["", "Anonymous", "API key"]} className="grid-cols-[6rem_1fr_1fr]" />
            {[
              ["Limit", `${ANON.burstPerMinute} req/min per IP`, `${API_PLAN.perDay.toLocaleString()} req/day per key`],
              ["Burst", "—", `${API_PLAN.burstPerMinute} req/min`],
              ["Caching", "5 min, shared", "none (private)"],
              ["Window header", "minute", "day + X-RateLimit-Reset"],
            ].map(([k, a, b]) => (
              <Row key={k} className="grid-cols-[6rem_1fr_1fr]" cols={[<span key="k" className="text-xs text-muted-foreground">{k}</span>, <span key="a" className="font-mono text-xs">{a}</span>, <span key="b" className="font-mono text-xs">{b}</span>]} />
            ))}
            <div className="p-4 pt-3 text-xs text-muted-foreground">
              Every response carries <code className="font-mono">X-RateLimit-Limit</code>, <code className="font-mono">X-RateLimit-Remaining</code> and <code className="font-mono">X-RateLimit-Window</code>; 429s add <code className="font-mono">Retry-After</code>.
            </div>
          </Panel>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-label">OpenAPI</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Machine-readable OpenAPI 3.1 at <a href="/api/openapi.json" className="break-all font-mono underline underline-offset-4">{SITE_URL}/api/openapi.json</a>. Generated from the same code as the routes, so it cannot drift.
            </div>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">Badge embed</div>
            <div className="mt-2"><Code>{`<a href="${SITE_URL}/s/your-slug">
  <img src="${SITE_URL}/api/badge/your-slug.svg?type=users" alt="Your SaaS on UserTrack" height="28">
</a>`}</Code></div>
            <div className="mt-2 text-xs text-muted-foreground">type = users · growth · trending · verified; theme = dark · light. Not rate limited, cached at the edge.</div>
          </Panel>
        </div>
      </section>

      {/* MCP */}
      <section className="mt-16">
        <H2 id="mcp" label="MCP">Let your agent do the setup</H2>

        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-label">Endpoint</div>
            <div className="mt-2 break-all font-mono text-sm">{MCP_URL}</div>
            <div className="mt-2 text-xs text-muted-foreground">Streamable HTTP, stateless, JSON responses. POST JSON-RPC; GET returns a discovery document.</div>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">Auth header</div>
            <div className="mt-2 break-all font-mono text-sm">Authorization: Bearer ut_mcp_…</div>
            <div className="mt-2 text-xs text-muted-foreground">MCP tokens only. Public API keys (<code className="font-mono">ut_api_</code>) are rejected with 401.</div>
          </Panel>
        </div>

        <Panel className="mt-3 p-0">
          <div className="p-4 pb-2 text-label">Scopes</div>
          {SCOPES.map((s) => (
            <Row key={s.key} className="md:grid-cols-[11rem_12rem_1fr]" cols={[<span key="k" className="font-mono text-xs text-pink">{s.key}</span>, <span key="l" className="text-sm">{s.label}</span>, <span key="d" className="text-xs text-muted-foreground">{s.description}</span>]} />
          ))}
          <div className="p-4 pt-3 text-xs text-muted-foreground">Recommended: all {SCOPES.length} for onboarding (the default). For reporting-only agents, <code className="font-mono">projects:read</code> + <code className="font-mono">metrics:read</code> is enough; add <code className="font-mono">follows:*</code> for the watchlist and <code className="font-mono">webhooks:*</code> to manage webhook endpoints.</div>
        </Panel>

        <Panel className="mt-3 p-0">
          <div className="p-4 pb-2 text-label">Tools ({TOOLS.length})</div>
          <Row head cols={["Tool", "Scope", "Mode", "What it does"]} className="hidden md:grid md:grid-cols-[15rem_9rem_4rem_1fr]" />
          {TOOLS.map((t) => (
            <Row
              key={t.name}
              className="md:grid-cols-[15rem_9rem_4rem_1fr]"
              cols={[
                <span key="n" className="break-all font-mono text-xs">{t.name}</span>,
                <span key="s" className="font-mono text-xs text-muted-foreground">{t.scope}</span>,
                <span key="m" className={`font-mono text-xs ${t.readOnly ? "text-muted-foreground" : "text-pink"}`}>{t.readOnly ? "read" : "write"}</span>,
                <span key="d" className="text-xs text-muted-foreground">{t.description}</span>,
              ]}
            />
          ))}
        </Panel>

        <div className="mt-3 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-label">Setup workflow</div>
            <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              {SETUP_WORKFLOW.map((s, i) => (
                <li key={s} className="flex gap-3"><span className="shrink-0 font-mono text-pink">{String(i + 1).padStart(2, "0")}</span><span className="break-words font-mono">{s}</span></li>
              ))}
            </ol>
            <div className="mt-3 text-xs text-muted-foreground">Sent to the agent as server instructions, so every client runs the same order without extra prompting.</div>
          </Panel>
          <Panel className="p-0">
            <div className="p-4 pb-2 text-label">Idempotency &amp; limits</div>
            {[
              ["Daily quota", `${MCP_PLAN.perDay.toLocaleString()} tool calls per token`],
              ["Burst", `${MCP_PLAN.burstPerMinute} tool calls per minute`],
              ["Create project", `≤ ${MCP_PLAN.createProjectPerHour} per hour; same domain returns the existing project`],
              ["Verify", `${MCP_PLAN.verifyCooldownSec}s cooldown per project`],
              ["Sync now", `${MCP_PLAN.syncCooldownSec}s cooldown per source`],
              ["Configure", "re-running replaces the source for that role"],
            ].map(([k, val]) => (
              <Row key={k} className="grid-cols-[7rem_1fr]" cols={[<span key="k" className="text-xs text-muted-foreground">{k}</span>, <span key="v" className="font-mono text-xs">{val}</span>]} />
            ))}
            <div className="p-4 pt-3 text-xs text-muted-foreground">Reads are generous, writes are conservative. Rate-limit errors include <code className="font-mono">retryAfterSec</code> and a hint not to loop.</div>
          </Panel>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-label">Security model</div>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>Tokens are stored as SHA-256 hashes and shown once. Revoke any time at <span className="font-mono">/app/developer</span>.</li>
              <li>Every call re-checks the token, its scopes and that the project belongs to the token owner. Ids alone are never trusted.</li>
              <li>No tool can delete a project or an integration.</li>
              <li>Provider credentials are validated, stored server-side and never returned — not to the dashboard, not to the API, not to the agent.</li>
              <li>Every write is recorded in an audit trail visible on the developer page.</li>
              <li>Only aggregate counts ever leave your stack; no emails, names or per-user rows.</li>
            </ul>
          </Panel>
          <Panel className="p-0">
            <div className="p-4 pb-2 text-label">Troubleshooting</div>
            {[
              ["401", "Missing, malformed, revoked or expired token, or a ut_api_ key used for MCP. Create a new MCP token and update the client config."],
              ["403", "Token lacks the scope the tool needs (the error names it). Create a token with that scope."],
              ["429", "Burst, daily quota, create limit or a cooldown. Wait retryAfterSec; do not retry in a loop."],
              ["404", "Project not found or not owned by this token. Call usertrack_get_projects to list what the token can see."],
            ].map(([code, desc]) => (
              <Row key={code} className="grid-cols-[3rem_1fr]" cols={[<span key="c" className="font-mono text-xs text-pink">{code}</span>, <span key="d" className="text-xs text-muted-foreground">{desc}</span>]} />
            ))}
            <div className="p-4 pt-3 text-xs text-muted-foreground">Tool failures come back as tool results with <code className="font-mono">isError: true</code> and a structured <code className="font-mono">error.code</code> + <code className="font-mono">hint</code>, so agents can recover without parsing prose.</div>
          </Panel>
        </div>
      </section>

      {/* Webhooks */}
      <section className="mt-16">
        <H2 id="webhooks" label="Webhooks">Get told when something happens</H2>
        <Panel className="mt-6 p-4">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>Signed <code className="font-mono">POST</code>s to your https endpoint for <code className="font-mono">milestone.reached</code>, <code className="font-mono">rank.changed</code>, <code className="font-mono">trending.rank_changed</code>, <code className="font-mono">growth.spike</code>, <code className="font-mono">integration.failed</code> / <code className="font-mono">recovered</code> and <code className="font-mono">project.verified</code>.</li>
            <li>Every payload carries <code className="font-mono">UserTrack-Signature</code> (HMAC-SHA256 with a per-endpoint secret shown once), a timestamp, a deterministic event id and an idempotency key; failed deliveries retry five times over 14 hours.</li>
            <li>Manage endpoints in <Link href="/app/developer" className="font-mono underline underline-offset-4">/app/developer</Link>, or let your agent do it with <code className="font-mono">usertrack_create_webhook</code> → <code className="font-mono">usertrack_test_webhook</code> → <code className="font-mono">usertrack_get_webhook_deliveries</code>.</li>
          </ul>
          <Link href="/developers/webhooks" className="mt-4 inline-flex items-center font-mono text-[11px] uppercase tracking-wider text-pink underline underline-offset-4">Webhook reference: payloads, signatures, retries →</Link>
        </Panel>
      </section>

      {/* Examples */}
      <section className="mt-16">
        <H2 id="examples" label="Examples">What to ask once connected</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-3 *:min-w-0">
          {EXAMPLES.map((e) => (
            <Panel key={e.ask} className="p-4">
              <div className="text-sm font-medium">“{e.ask}”</div>
              <div className="mt-3 text-label">Tools</div>
              <ul className="mt-1 space-y-1">
                {e.tools.map((t) => <li key={t} className="break-all font-mono text-xs text-pink">{t}</li>)}
              </ul>
              <div className="mt-3 text-xs text-muted-foreground">{e.out}</div>
            </Panel>
          ))}
        </div>
      </section>

      {/* CTA */}
      <Panel className="mt-16 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-label">Get started</div>
          <div className="mt-1 text-lg font-medium">Create an API key or MCP token</div>
          <div className="mt-1 text-sm text-muted-foreground">Free. Takes ten seconds. Full references in <code className="font-mono">docs/API.md</code> and <code className="font-mono">docs/MCP.md</code>.</div>
        </div>
        <Link href="/app/developer" className="inline-flex shrink-0 items-center justify-center bg-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-background hover:bg-pink hover:text-white">
          Open /app/developer
        </Link>
      </Panel>
    </div>
  );
}
