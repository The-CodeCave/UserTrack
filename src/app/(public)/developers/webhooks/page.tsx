import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { DISABLE_AFTER_FAILURES, MAX_ATTEMPTS, MAX_ENDPOINTS, RETRY_DELAYS_MS, SIGNATURE_TOLERANCE_SEC, WEBHOOK_API_VERSION, WEBHOOK_EVENTS, WEBHOOK_TIMEOUT_MS } from "@convex/lib/webhooks";
import { EVENT_DATA_EXAMPLES, PAYLOAD_EXAMPLE, PYTHON_VERIFY_SNIPPET, nodeVerifySnippet } from "@/components/app/developer/webhooks/snippets";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Webhooks",
  description: "Receive signed HTTP POSTs from UserTrack when your SaaS hits a milestone, moves on the leaderboard, spikes, gets verified, or a data source fails and recovers. HMAC-SHA256 signatures, retries, idempotent delivery.",
  alternates: { canonical: `${SITE_URL}/developers/webhooks` },
};

const NAV = [
  ["#overview", "Overview"],
  ["#setup", "Setup"],
  ["#events", "Events"],
  ["#payload", "Payload"],
  ["#signature", "Signature"],
  ["#retries", "Retries"],
  ["#test", "Test events"],
  ["#idempotency", "Idempotency"],
  ["#security", "Security"],
  ["#limits", "Limits"],
];

const HEADERS = [
  ["UserTrack-Signature", "v1=<hex>", "HMAC-SHA256 of `${timestamp}.${rawBody}` with your endpoint secret."],
  ["UserTrack-Timestamp", "1756800000", `Unix seconds when the request was signed. Reject if older than ${SIGNATURE_TOLERANCE_SEC / 60} minutes.`],
  ["UserTrack-Event", "milestone.reached", "Event type; also in the body as type."],
  ["UserTrack-Delivery", "dlv_…", "Unique per delivery (one endpoint, one event). Also sent as Idempotency-Key."],
  ["UserTrack-Event-Id", "evt_…", "Deterministic per source event — identical across endpoints and retries."],
];

const RETRY_LABEL = ["immediately", "5 min", "30 min", "2 h", "12 h"];

const fmtDelay = (ms: number) => { const m = Math.round(ms / 60_000), h = Math.floor(m / 60); return m === 0 ? "0" : [h ? `${h} h` : "", m % 60 ? `${m % 60} min` : ""].filter(Boolean).join(" "); };

const MCP_TOOLS = [
  ["usertrack_get_webhooks", "webhooks:read", "List endpoints with status and last delivery."],
  ["usertrack_create_webhook", "webhooks:write", "Create an endpoint; returns the secret once."],
  ["usertrack_update_webhook", "webhooks:write", "Change URL, events, scope, or enable / disable."],
  ["usertrack_test_webhook", "webhooks:write", "Queue a webhook.test delivery."],
  ["usertrack_get_webhook_deliveries", "webhooks:read", "Recent deliveries with attempts, HTTP status and errors."],
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

function Row({ cols, head = false, className = "" }: { cols: ReactNode[]; head?: boolean; className?: string }) {
  return (
    <div className={`grid gap-x-4 gap-y-1 border-b border-line p-3 text-sm last:border-0 *:min-w-0 *:break-words ${head ? "text-label" : ""} ${className}`}>
      {cols.map((c, i) => <div key={i} className="min-w-0">{c}</div>)}
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <Panel className="p-4">
      <div className="flex items-baseline gap-3"><span className="font-mono text-pink">{n}</span><div className="font-medium">{title}</div></div>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </Panel>
  );
}

export default function WebhooksDocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <SectionLabel><Link href="/developers" className="hover:text-foreground">Developers</Link> / Webhooks</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Growth events, pushed to you.</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        A signed HTTP POST the moment your SaaS hits a milestone, moves on a board, spikes, gets verified, or a data source fails and recovers. Same events as the dashboard and the feed — nothing synthesized from small metric changes.
      </p>

      <nav aria-label="On this page" className="sticky top-14 z-30 -mx-4 mt-8 border-y border-line bg-background/90 px-4 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {NAV.map(([href, label]) => <a key={href} href={href} className="shrink-0 px-2 py-1 hover:text-foreground">{label}</a>)}
        </div>
      </nav>

      <section className="mt-12">
        <H2 id="overview" label="Overview">How it works</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-3 *:min-w-0">
          {[
            ["Subscribe", `Add up to ${MAX_ENDPOINTS} https endpoints in /app/developer/webhooks, pick events, optionally scope to one project.`],
            ["Receive", "Each event is a JSON POST with the project reference and event data, signed with HMAC-SHA256 and a timestamp."],
            ["Acknowledge", `Respond 2xx within ${WEBHOOK_TIMEOUT_MS / 1000} s. Anything else is retried ${MAX_ATTEMPTS - 1} more times over ~14.5 hours.`],
          ].map(([title, body]) => (
            <Panel key={title} className="p-4"><div className="text-label">{title}</div><div className="mt-2 text-sm text-muted-foreground">{body}</div></Panel>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <H2 id="setup" label="Setup">Four steps</H2>
        <div className="mt-6 space-y-3">
          <Step n="01" title="Create an endpoint">Open <Link href="/app/developer/webhooks" className="font-mono underline underline-offset-4">/app/developer/webhooks</Link>, add your https URL, choose events and (optionally) one project. The signing secret (<code className="font-mono">whsec_…</code>) is shown once.</Step>
          <Step n="02" title="Verify the signature">Compute the HMAC over the raw request body and compare in constant time. Samples in Node and Python below.</Step>
          <Step n="03" title="Send a test">Click “Send test” on the endpoint; a <code className="font-mono">webhook.test</code> event goes through the exact same pipeline, signature and retry log.</Step>
          <Step n="04" title="Respond 2xx fast">Queue the work and return immediately. Use <code className="font-mono">UserTrack-Event-Id</code> to make your handler idempotent.</Step>
        </div>
      </section>

      <section className="mt-16">
        <H2 id="events" label="Events">Event catalog</H2>
        <Panel className="mt-6 p-0">
          <Row head cols={["Type", "When", "data.*"]} className="hidden md:grid md:grid-cols-[12rem_1fr_1.4fr]" />
          {[...WEBHOOK_EVENTS, { type: "webhook.test", label: "Test event", blurb: "Sent on demand from the dashboard or MCP; carries test: true." }].map((e) => (
            <Row key={e.type} className="md:grid-cols-[12rem_1fr_1.4fr]" cols={[
              <span key="t" className="break-all font-mono text-sm text-pink">{e.type}</span>,
              <span key="b" className="text-xs text-muted-foreground">{e.blurb}</span>,
              <code key="d" className="block whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/80">{EVENT_DATA_EXAMPLES[e.type]}</code>,
            ]} />
          ))}
        </Panel>
        <p className="mt-2 text-xs text-muted-foreground">Rank events fire at most once per UTC day per board. Milestones and spikes are deduplicated by key, so a re-sync never re-sends them.</p>
      </section>

      <section className="mt-16">
        <H2 id="payload" label="Payload">Versioned JSON</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1.4fr] *:min-w-0">
          <Panel className="p-4">
            <div className="text-label">Envelope</div>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li><code className="font-mono text-foreground">id</code> — event id, stable across endpoints and retries.</li>
              <li><code className="font-mono text-foreground">type</code> — one of the types above.</li>
              <li><code className="font-mono text-foreground">apiVersion</code> — <span className="font-mono">{WEBHOOK_API_VERSION}</span>. Only additive changes within a version.</li>
              <li><code className="font-mono text-foreground">createdAt</code> — ISO 8601, when the event happened.</li>
              <li><code className="font-mono text-foreground">test</code> — <span className="font-mono">true</span> only on webhook.test.</li>
              <li><code className="font-mono text-foreground">data.project</code> — id, slug, name, url, totalUsers. Always present.</li>
            </ul>
          </Panel>
          <Panel className="p-4"><div className="text-label">Example · milestone.reached</div><div className="mt-2"><Code>{PAYLOAD_EXAMPLE}</Code></div></Panel>
        </div>
      </section>

      <section className="mt-16">
        <H2 id="signature" label="Signature verification">Trust, but verify</H2>
        <Panel className="mt-6 p-0">
          <Row head cols={["Header", "Example", "Meaning"]} className="hidden md:grid md:grid-cols-[11rem_9rem_1fr]" />
          {HEADERS.map(([h, ex, d]) => <Row key={h} className="md:grid-cols-[11rem_9rem_1fr]" cols={[<span key="h" className="font-mono text-xs text-pink">{h}</span>, <span key="e" className="font-mono text-xs">{ex}</span>, <span key="d" className="text-xs text-muted-foreground">{d}</span>]} />)}
        </Panel>
        <Panel className="mt-3 p-4">
          <div className="text-label">Algorithm</div>
          <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {[
              "Read the raw request body as bytes — do not parse and re-serialize.",
              "Build the signed string: `${UserTrack-Timestamp}.${rawBody}`.",
              "Compute hex(HMAC-SHA256(secret, signedString)) and prefix with v1=.",
              "Compare with UserTrack-Signature using a constant-time comparison.",
              `Reject if |now − timestamp| > ${SIGNATURE_TOLERANCE_SEC} s (${SIGNATURE_TOLERANCE_SEC / 60} minutes) to defeat replays.`,
            ].map((s, i) => <li key={s} className="flex gap-3"><span className="shrink-0 font-mono text-pink">{String(i + 1).padStart(2, "0")}</span><span className="break-words">{s}</span></li>)}
          </ol>
        </Panel>
        <div className="mt-3 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4"><div className="text-label">Node / TypeScript</div><div className="mt-2"><Code>{nodeVerifySnippet()}</Code></div></Panel>
          <Panel className="p-4"><div className="text-label">Python</div><div className="mt-2"><Code>{PYTHON_VERIFY_SNIPPET}</Code></div></Panel>
        </div>
      </section>

      <section className="mt-16">
        <H2 id="retries" label="Retries">Schedule</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-0">
            <Row head cols={["Attempt", "Delay after previous failure", "Cumulative"]} className="grid-cols-[5rem_1fr_6rem]" />
            {RETRY_DELAYS_MS.map((ms, i) => (
              <Row key={i} className="grid-cols-[5rem_1fr_6rem]" cols={[<span key="a" className="font-mono text-xs">{i + 1}</span>, <span key="d" className="font-mono text-xs">{RETRY_LABEL[i]}</span>, <span key="c" className="font-mono text-xs text-muted-foreground">{fmtDelay(RETRY_DELAYS_MS.slice(0, i + 1).reduce((a, b) => a + b, 0))}</span>]} />
            ))}
          </Panel>
          <Panel className="p-4">
            <div className="text-label">Rules</div>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>Retried: 5xx, 408, 425, 429, network errors and timeouts ({WEBHOOK_TIMEOUT_MS / 1000} s).</li>
              <li>Final: any other 4xx. Fix the endpoint and use “Retry” in the delivery log.</li>
              <li>After {MAX_ATTEMPTS} attempts the delivery is <span className="font-mono">exhausted</span>; it can still be retried manually.</li>
              <li>{DISABLE_AFTER_FAILURES} consecutive failures disable the endpoint. Re-enable it from the dashboard; the failure counter resets.</li>
              <li>Retries reuse the same delivery id and event id; the timestamp and signature are fresh on every attempt.</li>
            </ul>
          </Panel>
        </div>
      </section>

      <section className="mt-16">
        <H2 id="test" label="Test events">Exercise the whole pipeline</H2>
        <Panel className="mt-6 p-4">
          <p className="text-sm text-muted-foreground">“Send test” in the dashboard (or <code className="font-mono">usertrack_test_webhook</code> over MCP) enqueues a <code className="font-mono">webhook.test</code> event regardless of the endpoint’s subscriptions. It is signed, retried and logged like any other delivery, carries <code className="font-mono">test: true</code> and a sample <code className="font-mono">milestone.reached</code> body under <code className="font-mono">data.sample</code>.</p>
          <div className="mt-3"><Code>{`{ "id": "evt_test_…", "type": "webhook.test", "apiVersion": "${WEBHOOK_API_VERSION}", "createdAt": "…", "test": true,
  "data": { "project": { … }, "message": "Test event from UserTrack…", "endpointId": "…", "sample": { "type": "milestone.reached", "milestone": { … } } } }`}</Code></div>
        </Panel>
      </section>

      <section className="mt-16">
        <H2 id="idempotency" label="Idempotency">Two ids, two jobs</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-4">
            <div className="text-label">UserTrack-Delivery · dlv_…</div>
            <p className="mt-2 text-xs text-muted-foreground">One per (endpoint, event). Identical on every retry of that delivery and sent again as <code className="font-mono">Idempotency-Key</code>. Use it to drop duplicate retries when your handler succeeded but the response got lost.</p>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">UserTrack-Event-Id · evt_… (= body.id)</div>
            <p className="mt-2 text-xs text-muted-foreground">Deterministic per source event, so two endpoints receiving the same milestone see the same id. Dedupe on it if several endpoints feed the same system.</p>
          </Panel>
        </div>
      </section>

      <section className="mt-16">
        <H2 id="security" label="Security">Defaults you cannot switch off</H2>
        <Panel className="mt-6 p-4">
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>https only. http URLs and URLs with credentials are rejected at creation.</li>
            <li>Private, loopback, link-local and cloud-metadata ranges are blocked, for literal IPs and for hostnames — DNS is resolved right before each delivery and refused if it points inside.</li>
            <li>Secrets are generated server-side, shown once, and rotatable at any time (“Rotate secret”). Old signatures stop validating immediately.</li>
            <li>Endpoints belong to your account; project-scoped endpoints only ever receive that project’s events. Demo projects never emit webhooks.</li>
            <li>Payloads contain aggregate counts only — no emails, names or per-user rows.</li>
            <li>Creating, rotating and deleting endpoints is recorded in your audit trail on <Link href="/app/developer" className="font-mono underline underline-offset-4">/app/developer</Link>.</li>
          </ul>
        </Panel>
      </section>

      <section className="mt-16">
        <H2 id="limits" label="Limits">Numbers</H2>
        <div className="mt-6 grid gap-3 md:grid-cols-2 *:min-w-0">
          <Panel className="p-0">
            {[
              ["Endpoints", `${MAX_ENDPOINTS} per account`],
              ["Timeout", `${WEBHOOK_TIMEOUT_MS / 1000} s per attempt`],
              ["Attempts", `${MAX_ATTEMPTS} (${RETRY_LABEL.join(", ")})`],
              ["Auto-disable", `${DISABLE_AFTER_FAILURES} consecutive failures`],
              ["Signature tolerance", `${SIGNATURE_TOLERANCE_SEC} s`],
              ["Delivery log", "25 most recent per endpoint (up to 100 via API)"],
            ].map(([k, v]) => <Row key={k} className="grid-cols-[10rem_1fr]" cols={[<span key="k" className="text-xs text-muted-foreground">{k}</span>, <span key="v" className="font-mono text-xs">{v}</span>]} />)}
          </Panel>
          <Panel className="p-0">
            <div className="p-4 pb-2 text-label">MCP tools</div>
            {MCP_TOOLS.map(([n, s, d]) => <Row key={n} className="grid-cols-1" cols={[<span key="n" className="flex flex-wrap items-center gap-2"><span className="break-all font-mono text-xs">{n}</span><span className="font-mono text-[10px] text-pink">{s}</span></span>, <span key="d" className="text-xs text-muted-foreground">{d}</span>]} />)}
            <div className="p-4 pt-3 text-xs text-muted-foreground">Scopes <code className="font-mono">webhooks:read</code> / <code className="font-mono">webhooks:write</code> on your MCP token. See <Link href="/developers#mcp" className="font-mono underline underline-offset-4">/developers#mcp</Link>.</div>
          </Panel>
        </div>
      </section>

      <Panel className="mt-16 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-label">Get started</div>
          <div className="mt-1 text-lg font-medium">Add your first endpoint</div>
          <div className="mt-1 text-sm text-muted-foreground">Free. Send a test event in under a minute.</div>
        </div>
        <Link href="/app/developer/webhooks" className="inline-flex shrink-0 items-center justify-center bg-foreground px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-background hover:bg-pink hover:text-white">
          Open /app/developer/webhooks
        </Link>
      </Panel>
    </div>
  );
}
