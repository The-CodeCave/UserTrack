import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { NativeSourceTabs } from "@/components/public/developers/native-source-tabs";
import { ENV_EXAMPLE_SNIPPET, NODE_MODIFICATION_RULES, NODE_PACKAGE_NAME, WHAT_IS_SENT } from "@convex/lib/nativeSetup";
import { MCP_URL, NATIVE_AGENT_PROMPT } from "@/lib/mcp/snippets";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Native SDK integration — @usertrack/node for Prisma, Drizzle, Convex, Auth.js and custom apps",
  description: "Make any app a verified UserTrack source with @usertrack/node: one signed handler, aggregate counts only, no PII, no database credentials shared. Adapters for Prisma, Drizzle, Convex and Auth.js.",
  alternates: { canonical: `${SITE_URL}/developers/integrations/native` },
};

const NAV = [["#overview", "Overview"], ["#install", "Install"], ["#roles", "Activation & conversion"], ["#verify", "Protocol"], ["#privacy", "Data & privacy"], ["#mcp", "MCP"], ["#troubleshooting", "Troubleshooting"]];

const RESPONSE = `{
  "protocolVersion": 1,
  "clientVersion": "0.1.0",
  "source": "prisma",
  "projectId": "<USERTRACK_PROJECT_ID>",
  "generatedAt": "2026-09-03T08:00:00.000Z",
  "users": { "totalUsers": 12481, "newUsers": { "24h": 84, "7d": 491, "30d": 1832 }, "daily": [{ "day": "2026-08-04", "newUsers": 51 }, "…"] },
  "activation": { "activatedUsers": 6210, "activated24h": 40, "activated7d": 260, "activated30d": 990 },
  "conversion": { "convertedUsers": 812, "newConverted30d": 61, "trialUsers": 130, "mode": "active_paid" },
  "capabilities": { "exactCounts": true, "history": true, "roles": ["users", "activation", "conversion"] }
}`;

const ROLES_SNIPPET = `export const POST = createUserTrackHandler({
  projectId: process.env.USERTRACK_PROJECT_ID!,
  secret: process.env.USERTRACK_SECRET!,
  source: "prisma",
  users: prismaUsers(prisma.user),
  activation: prismaUsers(prisma.workspace),                                        // one row per activated user
  conversion: { converted: prismaUsers(prisma.subscription, { where: { status: "active" } }), mode: "active_paid" },
});`;

const TROUBLE = [
  ["No UserTrack handler found at …/metrics (404)", "The route is not mounted at the base URL you entered, or the deploy is not live.", "Mount the handler, redeploy, check the base URL (metrics live at <base>/metrics)."],
  ["… rejected the signature (401)", "USERTRACK_SECRET or USERTRACK_PROJECT_ID in the deployed environment differ from the integration.", "Fix the env vars in every environment and redeploy — or rotate the secret in UserTrack and update the app."],
  ["… rejected the request as stale", "The server clock is off by more than 5 minutes.", "Fix NTP on the host; UserTrack retries automatically."],
  ["Could not reach …", "Wrong base URL, app down or blocked.", "The URL must be reachable over HTTPS from the internet."],
  ["… could not count users (500)", "Your count source threw.", "Enable debug: true to log the error server-side; it is never sent to UserTrack."],
  ["Counts labelled approximate", "A source returned exact: false (Convex cap).", "Keep an exact counter (@convex-dev/aggregate) and return its value."],
];

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

export default function NativeDocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground"><Link href="/developers" className="hover:text-foreground">Developers</Link> / Integrations / Native SDK</div>
      <SectionLabel className="mt-4">Native SDK</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Any app → UserTrack in two minutes.</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        <code className="font-mono text-foreground">{NODE_PACKAGE_NAME}</code> mounts one signed, read-only handler in your app. UserTrack pulls aggregate counts from it every 4 hours — verified, without emails, names, user records or database credentials leaving your app. Adapters for Prisma, Drizzle, Convex and Auth.js; a <code className="font-mono">count()</code> function is all a custom app needs.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Using Better Auth? The official plugin speaks the same protocol: <Link href="/developers/integrations/better-auth" className="underline-offset-2 hover:underline">@usertrack/better-auth</Link>.</p>

      <nav aria-label="On this page" className="sticky top-14 z-30 -mx-4 mt-8 border-y border-line bg-background/90 px-4 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {NAV.map(([href, label]) => <a key={href} href={href} className="shrink-0 px-2 py-1 hover:text-foreground">{label}</a>)}
        </div>
      </nav>

      <section className="mt-12">
        <H2 id="overview" label="Overview">Why native</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-3 *:min-w-0">
          {[
            ["Native · verified", "The response is signed with a secret only your deployment holds, so UserTrack marks the source Verified regardless of hostname — unlike a plain JSON endpoint."],
            ["Whole funnel, one handler", "Signed up from your users table; optionally Activated (a table with one row per activated user) and Trial / Converted (subscription state, never amounts) from the same route. UserTrack attaches the extra stages automatically."],
            ["Nothing breaks", "Read-only aggregate queries; the optional push hooks are fire-and-forget. If UserTrack is down, your app never notices."],
          ].map(([t, d]) => (
            <Panel key={t} className="p-4"><div className="text-sm font-medium">{t}</div><p className="mt-1 text-sm text-muted-foreground">{d}</p></Panel>
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">ESM · Node 18.17+ and edge runtimes with WebCrypto · zero runtime dependencies · works as a Next.js route export, in Hono, Remix, Bun, Cloudflare Workers, and via toNodeHandler() in Express or node:http.</p>
      </section>

      <section className="mt-14">
        <H2 id="install" label="Manual setup">Install and configure</H2>
        <ol className="mt-6 space-y-6">
          <li>
            <div className="text-sm font-medium">1 · Create the integration in UserTrack</div>
            <p className="mt-1 text-sm text-muted-foreground">Project → Integrations → Users → <strong className="text-foreground">My app (SDK)</strong>, pick your adapter and enter the base URL where the handler will live (default <code className="font-mono">https://your-app.com/api/usertrack</code>; Convex: your <code className="font-mono">.convex.site</code> URL). UserTrack generates <code className="font-mono">USERTRACK_PROJECT_ID</code> and a <code className="font-mono">USERTRACK_SECRET</code> (<code className="font-mono">ut_int_…</code>, shown once — rotate it if lost).</p>
          </li>
          <li>
            <div className="text-sm font-medium">2 · Install the package and mount the handler</div>
            <div className="mt-2"><NativeSourceTabs /></div>
          </li>
          <li>
            <div className="text-sm font-medium">3 · Environment variables</div>
            <div className="mt-2"><Code>{ENV_EXAMPLE_SNIPPET}</Code></div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">Set the real values in your local env file and in your hosting provider for every environment. Never commit the secret.</p>
          </li>
          <li>
            <div className="text-sm font-medium">4 · Deploy, then click Verify</div>
            <p className="mt-1 text-sm text-muted-foreground">UserTrack calls <code className="font-mono">POST &lt;base&gt;/metrics</code> once, checks the signature, reads the total user count, records the first verified snapshot and schedules syncs every 4 hours. Result: <em>Connected · 12,481 users detected · Verified via Prisma (UserTrack SDK)</em>.</p>
          </li>
        </ol>
      </section>

      <section className="mt-14">
        <H2 id="roles" label="Lifecycle">Activation and conversion from the same handler</H2>
        <p className="mt-4 text-sm text-muted-foreground">Any count source works for any stage. Pass <code className="font-mono">activation</code> and / or <code className="font-mono">conversion</code>; UserTrack attaches the stages after the next sync of your users source — no second credential, no second setup.</p>
        <div className="mt-3"><Code>{ROLES_SNIPPET}</Code></div>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2"><span className="font-mono text-pink">›</span><span>A count source is <code className="font-mono">{"{ count({ createdAtGte?, createdAtLt? }) => Promise<number | { count, exact }> }"}</code>. Return <code className="font-mono">exact: false</code> if you hit a scan cap; set <code className="font-mono">timeFilter: false</code> when the table has no timestamp (totals only).</span></li>
          <li className="flex gap-2"><span className="font-mono text-pink">›</span><span>Conversion is <em>state only</em>: who is converted / on a trial, plus <code className="font-mono">mode</code> (<code className="font-mono">active_paid</code> default, <code className="font-mono">ever_paid</code>, <code className="font-mono">first_payment</code>). UserTrack never asks for amounts, prices or MRR.</span></li>
          <li className="flex gap-2"><span className="font-mono text-pink">›</span><span>Optional <code className="font-mono">identities()</code> returns stable user ids per stage for Cohort Verified funnels — never emails (anything containing <code className="font-mono">@</code> is dropped).</span></li>
          <li className="flex gap-2"><span className="font-mono text-pink">›</span><span>Push between syncs with <code className="font-mono">createTracker().track(&quot;user.created&quot; | &quot;user.activated&quot; | &quot;trial.started&quot; | &quot;user.converted&quot;, {"{ id }"})</code> — the id is HMAC-pseudonymised before it leaves your app.</span></li>
        </ul>
      </section>

      <section className="mt-14">
        <H2 id="verify" label="Protocol">How verification works</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-sm font-medium">Pull — source of truth</div>
            <p className="mt-1 text-sm text-muted-foreground">UserTrack sends <code className="font-mono">POST &lt;base&gt;/metrics</code> with <code className="font-mono">{"{ protocolVersion: 1 }"}</code> (plus <code className="font-mono">days</code> for the 30-day history on first sync). Each request carries <code className="font-mono">x-usertrack-project</code>, <code className="font-mono">-timestamp</code>, <code className="font-mono">-nonce</code> and an HMAC-SHA256 <code className="font-mono">-signature</code> over method, path, timestamp, nonce and body hash. The handler verifies with a timing-safe comparison, rejects timestamps outside ±5 minutes and replayed nonces, then signs its response bound to the request nonce. UserTrack verifies that signature before storing anything.</p>
          </Panel>
          <Panel className="p-4">
            <div className="text-sm font-medium">Push — freshness (optional)</div>
            <p className="mt-1 text-sm text-muted-foreground">Lifecycle events go to <code className="font-mono">{SITE_URL}/api/integrations/native/events</code> — after your write, fire-and-forget, 3-second timeout, deduplicated by event id. The dashboard shows signups, activations and conversions between syncs; the next pull always wins.</p>
          </Panel>
        </div>
        <div className="mt-4"><Code>{RESPONSE}</Code></div>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">Protocol package: <code>@usertrack/protocol</code> (WebCrypto only, zero dependencies) if you implement the client in another language. UserTrack checks <code>protocolVersion</code> (supported: 1) and <code>clientVersion</code> on every sync.</p>
      </section>

      <section className="mt-14">
        <H2 id="privacy" label="Data & privacy">What leaves your app</H2>
        <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
          {WHAT_IS_SENT.map((w) => <li key={w} className="flex gap-2"><span className="font-mono text-pink">›</span><span>{w}</span></li>)}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">On your public UserTrack page the source appears only as provenance: <em>Verified via Prisma (UserTrack SDK)</em>. Trust semantics are the same as for every provider: UserTrack independently retrieves aggregate metrics from your installation; it does not claim that every account is a real human.</p>
      </section>

      <section className="mt-14">
        <H2 id="mcp" label="AI setup">Let your coding agent do it</H2>
        <p className="mt-4 text-sm text-muted-foreground">Connect the UserTrack MCP server (<code className="font-mono">{MCP_URL}</code>, token from <Link href="/app/developer" className="underline-offset-2 hover:underline">your developer page</Link>) to Claude Code, Cursor, Codex or VS Code and send:</p>
        <div className="mt-3"><Code>{NATIVE_AGENT_PROMPT}</Code></div>
        <p className="mt-3 text-sm text-muted-foreground">The agent calls <code className="font-mono">usertrack_create_integration</code> <code className="font-mono">{"{ provider: \"native\", source }"}</code> (receives the secret once), <code className="font-mono">usertrack_get_native_setup</code> (install command, route file, env vars, safety rules) and <code className="font-mono">usertrack_verify_integration</code>. The instructions it receives include these safety rules:</p>
        <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {NODE_MODIFICATION_RULES.map((r, i) => <li key={i} className="flex gap-2"><span className="font-mono text-pink">{String(i + 1).padStart(2, "0")}</span><span>{r}</span></li>)}
        </ol>
      </section>

      <section className="mt-14">
        <H2 id="troubleshooting" label="Troubleshooting">Common errors</H2>
        <Panel className="mt-6 overflow-hidden">
          <div className="grid gap-x-4 gap-y-1 border-b border-line p-3 text-label sm:grid-cols-[1.2fr_1fr_1fr]"><div>Message</div><div>Cause</div><div>Fix</div></div>
          {TROUBLE.map(([m, c, f]) => (
            <div key={m} className="grid gap-x-4 gap-y-1 border-b border-line p-3 text-sm last:border-0 *:min-w-0 *:break-words sm:grid-cols-[1.2fr_1fr_1fr]"><div className="font-mono text-[12px]">{m}</div><div className="text-muted-foreground">{c}</div><div className="text-muted-foreground">{f}</div></div>
          ))}
        </Panel>
        <p className="mt-4 text-sm text-muted-foreground">Package source, tests and changelog: <a href="https://github.com/The-CodeCave/UserTrack/tree/main/packages/node" className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">github.com/The-CodeCave/UserTrack</a> · npm: <code className="font-mono">{NODE_PACKAGE_NAME}</code> · MIT.</p>
      </section>
    </div>
  );
}
