import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { SnippetTabs } from "@/components/public/developers/snippet-tabs";
import { CODE_MODIFICATION_RULES, ENV_EXAMPLE_SNIPPET, INSTALL_COMMANDS, PACKAGE_MANAGERS, PACKAGE_NAME, PLUGIN_MIN_BETTER_AUTH, PLUGIN_SNIPPET, WHAT_IS_SENT } from "@convex/lib/betterAuthSetup";
import { BETTER_AUTH_AGENT_PROMPT, MCP_URL } from "@/lib/mcp/snippets";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Better Auth integration — official UserTrack plugin",
  description: "Track verified registered-user growth from Better Auth in UserTrack with @usertrack/better-auth: signed aggregate metrics, no PII, 2-minute setup, MCP-automatable.",
  alternates: { canonical: `${SITE_URL}/developers/integrations/better-auth` },
};

const NAV = [["#overview", "Overview"], ["#install", "Install"], ["#verify", "Verification"], ["#privacy", "Data & privacy"], ["#mcp", "MCP"], ["#troubleshooting", "Troubleshooting"]];

const RESPONSE = `{
  "protocolVersion": 1,
  "pluginVersion": "0.1.0",
  "provider": "better-auth",
  "projectId": "<USERTRACK_PROJECT_ID>",
  "generatedAt": "2026-09-02T08:00:00.000Z",
  "totalUsers": 12481,
  "newUsers": { "24h": 84, "7d": 491, "30d": 1832 },
  "daily": [{ "day": "2026-08-04", "newUsers": 51 }, "…"],
  "capabilities": { "exactCounts": true, "history": true, "anonymousExcluded": false }
}`;

const TROUBLE = [
  ["No UserTrack plugin found at …/usertrack/metrics (404)", "The plugin is not installed, not in the plugins array, or the deploy is not live yet.", "Install, register userTrack(), redeploy, verify again."],
  ["… rejected the signature (401)", "USERTRACK_SECRET or USERTRACK_PROJECT_ID in the deployed environment differ from the integration.", "Fix the env vars in every environment and redeploy — or rotate the secret in UserTrack and update the app."],
  ["… rejected the request as stale", "The server clock is off by more than 5 minutes.", "Fix NTP on the host; UserTrack retries automatically."],
  ["Could not reach …", "Wrong base URL, app down or blocked.", "The URL must be baseURL + basePath of Better Auth (usually /api/auth)."],
  ["… could not count users (500)", "The Better Auth database adapter failed to count the user model.", "Check the adapter logs; adapter.count on user must work."],
  ["… is outdated / unsupported protocol version", "Old plugin version.", `Update ${PACKAGE_NAME}.`],
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

export default function BetterAuthDocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground"><Link href="/developers" className="hover:text-foreground">Developers</Link> / Integrations / Better Auth</div>
      <SectionLabel className="mt-4">Official plugin</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Better Auth → UserTrack in two minutes.</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        <code className="font-mono text-foreground">{PACKAGE_NAME}</code> adds one signed, read-only endpoint to your Better Auth instance. UserTrack pulls aggregate user counts from it every 4 hours — verified, without emails, names or any user record leaving your app.
      </p>

      <nav aria-label="On this page" className="sticky top-14 z-30 -mx-4 mt-8 border-y border-line bg-background/90 px-4 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {NAV.map(([href, label]) => <a key={href} href={href} className="shrink-0 px-2 py-1 hover:text-foreground">{label}</a>)}
        </div>
      </nav>

      <section className="mt-12">
        <H2 id="overview" label="Overview">Why use the plugin</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-3 *:min-w-0">
          {[
            ["Native · verified", "The response is signed with a secret only your deployment holds, so UserTrack marks the source Verified regardless of hostname. Better Auth feeds the Signed up stage of your funnel."],
            ["No credentials shared", "No database URL, no admin key. The plugin answers from inside your app using the adapter you already configured (Prisma, Drizzle, Kysely, Mongo, Convex…)."],
            ["Nothing breaks", "Observational only: login, signup, sessions and your other plugins are untouched. If UserTrack is down, nothing in your auth flow notices."],
          ].map(([t, d]) => (
            <Panel key={t} className="p-4"><div className="text-sm font-medium">{t}</div><p className="mt-1 text-sm text-muted-foreground">{d}</p></Panel>
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">Supported: better-auth ≥ {PLUGIN_MIN_BETTER_AUTH} · ESM · Node 18.17+ and edge runtimes with WebCrypto · any database adapter that implements count (others fall back to a bounded id-only scan).</p>
      </section>

      <section className="mt-14">
        <H2 id="install" label="Manual setup">Install and configure</H2>
        <ol className="mt-6 space-y-6">
          <li>
            <div className="text-sm font-medium">1 · Create the integration in UserTrack</div>
            <p className="mt-1 text-sm text-muted-foreground">Project → Integrations → Users → <strong className="text-foreground">Better Auth</strong>. Enter your Better Auth base URL (baseURL + basePath, usually <code className="font-mono">/api/auth</code>). UserTrack generates <code className="font-mono">USERTRACK_PROJECT_ID</code> and a <code className="font-mono">USERTRACK_SECRET</code> (<code className="font-mono">ut_int_…</code>, shown once — rotate it if lost).</p>
          </li>
          <li>
            <div className="text-sm font-medium">2 · Install the package</div>
            <div className="mt-2"><SnippetTabs snippets={PACKAGE_MANAGERS.map((pm) => ({ id: pm, label: pm, language: "bash" as const, text: INSTALL_COMMANDS[pm] }))} /></div>
          </li>
          <li>
            <div className="text-sm font-medium">3 · Add the plugin to your Better Auth config</div>
            <div className="mt-2"><Code>{PLUGIN_SNIPPET}</Code></div>
          </li>
          <li>
            <div className="text-sm font-medium">4 · Environment variables</div>
            <div className="mt-2"><Code>{ENV_EXAMPLE_SNIPPET}</Code></div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">Set the real values in your local env file and in your hosting provider for every environment. Never commit the secret.</p>
          </li>
          <li>
            <div className="text-sm font-medium">5 · Deploy, then click Verify</div>
            <p className="mt-1 text-sm text-muted-foreground">UserTrack calls your app once, checks the signature, reads the total user count, records the first verified snapshot and schedules syncs every 4 hours. Result: <em>Connected · 12,481 users detected · Verified via Better Auth</em>.</p>
          </li>
        </ol>
      </section>

      <section className="mt-14">
        <H2 id="verify" label="Protocol">How verification works</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-sm font-medium">Pull — source of truth</div>
            <p className="mt-1 text-sm text-muted-foreground">UserTrack sends <code className="font-mono">POST &lt;basePath&gt;/usertrack/metrics</code> with <code className="font-mono">{"{ protocolVersion: 1 }"}</code> (plus <code className="font-mono">days</code> for the 30-day history on first sync, or <code className="font-mono">from</code> / <code className="font-mono">to</code> for any window). Each request carries <code className="font-mono">x-usertrack-project</code>, <code className="font-mono">-timestamp</code>, <code className="font-mono">-nonce</code> and an HMAC-SHA256 <code className="font-mono">-signature</code> over method, path, timestamp, nonce and body hash. The plugin verifies with a timing-safe comparison, rejects timestamps outside ±5 minutes and replayed nonces, then signs its response bound to the request nonce. UserTrack verifies that signature before storing anything.</p>
          </Panel>
          <Panel className="p-4">
            <div className="text-sm font-medium">Push — freshness (optional)</div>
            <p className="mt-1 text-sm text-muted-foreground">On <code className="font-mono">user.created</code> / <code className="font-mono">user.deleted</code> the plugin posts a signed event to <code className="font-mono">{SITE_URL}/api/integrations/better-auth/events</code> — after the database write, fire-and-forget, 3-second timeout, deduplicated by event id. The dashboard shows signups between syncs; the next pull always wins. Disable with <code className="font-mono">events: false</code>.</p>
          </Panel>
        </div>
        <div className="mt-4"><Code>{RESPONSE}</Code></div>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">Compatibility: UserTrack checks <code>protocolVersion</code> (supported: 1) and <code>pluginVersion</code> (minimum 0.1.0) on every sync and shows an actionable error when the plugin is outdated.</p>
      </section>

      <section className="mt-14">
        <H2 id="privacy" label="Data & privacy">What leaves your app</H2>
        <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
          {WHAT_IS_SENT.map((w) => <li key={w} className="flex gap-2"><span className="font-mono text-pink">›</span><span>{w}</span></li>)}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">Users created by the Better Auth <code className="font-mono">anonymous</code> plugin are excluded from registered-user counts automatically. On your public UserTrack page the source appears only as provenance: <em>Verified via Better Auth</em>. Trust semantics are the same as for every provider: UserTrack independently retrieves aggregate metrics from your installation; it does not claim that every account is a real human.</p>
      </section>

      <section className="mt-14">
        <H2 id="mcp" label="AI setup">Let your coding agent do it</H2>
        <p className="mt-4 text-sm text-muted-foreground">Connect the UserTrack MCP server (<code className="font-mono">{MCP_URL}</code>, token from <Link href="/app/developer" className="underline-offset-2 hover:underline">your developer page</Link>) to Claude Code, Cursor, Codex or VS Code and send:</p>
        <div className="mt-3"><Code>{BETTER_AUTH_AGENT_PROMPT}</Code></div>
        <p className="mt-3 text-sm text-muted-foreground">The agent calls <code className="font-mono">usertrack_create_integration</code> (receives the secret once), <code className="font-mono">usertrack_get_better_auth_setup</code> (install command for npm / pnpm / yarn / bun, code change, env vars) and <code className="font-mono">usertrack_verify_integration</code>. The instructions it receives include these safety rules:</p>
        <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {CODE_MODIFICATION_RULES.map((r, i) => <li key={i} className="flex gap-2"><span className="font-mono text-pink">{String(i + 1).padStart(2, "0")}</span><span>{r}</span></li>)}
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
        <p className="mt-4 text-sm text-muted-foreground">Package source, tests and changelog: <a href="https://github.com/The-CodeCave/UserTrack/tree/main/packages/better-auth" className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">github.com/The-CodeCave/UserTrack</a> · npm: <code className="font-mono">{PACKAGE_NAME}</code> · MIT.</p>
      </section>
    </div>
  );
}
