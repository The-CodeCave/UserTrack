// Long, self-contained prompts a founder can paste into a coding agent (Claude Code, Cursor, Codex …). Every prompt
// carries the real snippet and the real URLs, so the agent never has to guess a slug, a token or an endpoint.
import { SITE_HOST, SITE_URL } from "@/lib/site";
import { mcpSnippets } from "@/lib/mcp/snippets";

const trim = (s: string) => s.trim().replace(/\n{3,}/g, "\n\n");

const OUTRO = `AFTER THE CHANGE
- Run this project's typecheck / lint / build (whatever exists) and fix anything you broke.
- Do not commit or push unless I ask.
- Report back: every file you touched, and where exactly the result is visible.`;

export function badgeAgentPrompt(o: { name: string; slug: string; kind: string; height: number; html: string; markdown: string; imageUrl: string; pageUrl: string }) {
  return trim(`Add the UserTrack badge for "${o.name}" to this project.

CONTEXT
UserTrack (${SITE_URL}) is a public leaderboard of verified SaaS user growth. This badge is a static SVG rendered on
UserTrack's servers from live numbers, cached ~1 hour at the edge, and it links back to my public growth page.
Badge type: "${o.kind}". Image: ${o.imageUrl}
Links to: ${o.pageUrl}

USE THIS EXACT MARKUP — do not rebuild it, do not re-host or proxy the SVG, do not change the query string:

HTML:
${o.html}

Markdown (README / docs):
${o.markdown}

WHERE TO PUT IT
1. First work out what this project is: Next.js / React / Vue / Svelte / Astro / plain HTML / a README-only repo.
2. Then find where social proof already lives — a footer, a "trusted by" or "as seen on" strip, the badge row under
   the H1 in README.md. Put it there. If nothing like that exists, add it to the site footer next to the copyright.
3. In JSX/TSX convert the HTML form: class -> className, self-close <img />, keep href, src, alt and height exactly.
4. In Markdown files use the Markdown form on the existing badge line, separated by a space from other badges.

HARD RULES
- Keep the <a> wrapper and the link target. An unlinked badge is not allowed by the embed terms.
- Keep height="${o.height}" and never set an explicit width — the SVG scales itself.
- Load it with a plain <img>. Do NOT route it through next/image, an image CDN, or any optimizer: it is a remote SVG
  that must stay live, and optimizers cache or reject it.
- Keep the alt text so it stays accessible.
- If this project sets a Content-Security-Policy, add ${SITE_HOST} to img-src — and nothing else.
- Change nothing else: no restyling, no refactors, no new dependencies, no other files.

${OUTRO}`);
}

export function widgetAgentPrompt(o: { name: string; slug: string; type: string; script: string; iframe: string; jsonUrl: string; width: number; height: number }) {
  return trim(`Embed the live UserTrack widget for "${o.name}" in this project.

CONTEXT
UserTrack (${SITE_URL}) is a public leaderboard of verified SaaS user growth. This widget renders my live "${o.type}"
metric, refreshes itself every 5 minutes and links back to my public growth page. It is a third-party iframe: it sets
no cookies, reads nothing from the host page and never blocks rendering.

OPTION A — script tag (preferred; it sizes itself):
${o.script}

OPTION B — plain iframe (use when scripts are not allowed, e.g. a strict CMS):
${o.iframe}

OPTION C — raw JSON, if you would rather render the number with this project's own components:
${o.jsonUrl}
(GET, public, no auth, CORS-enabled. Cache it for at least 60s. If you take this route, keep a visible link to
${SITE_URL}/s/${o.slug} — attribution is required.)

WHAT TO DO
1. Identify the framework and find the right place: landing page hero, a stats/social-proof section, or the footer.
2. Insert Option A there. In React/Next.js do NOT paste a raw <script> into JSX — it will not execute. Use the
   Next.js <Script strategy="afterInteractive" /> component, or render the Option B iframe instead. Pick whichever
   is idiomatic for this codebase and say which one you picked and why.
3. Give it a sensible container: it starts at ${o.width}x${o.height}px and reports its real size via postMessage.
   Do not force a fixed height that clips it, and let it stay responsive (max-width: 100%).
4. If a Content-Security-Policy exists, add ${SITE_HOST} to script-src and frame-src (Option B needs frame-src only).

HARD RULES
- Do not copy the numbers into static text. The point is that it stays live.
- Do not remove the UserTrack branding or the outbound link.
- One widget per page unless I asked for more. Change nothing else in this codebase.

${OUTRO}`);
}

export function mcpAgentPrompt(o: { token: string; task?: string; project?: { id: string; name: string; websiteUrl: string } }) {
  const client = mcpSnippets(o.token);
  const claude = client.find((s) => s.id === "claude-code")!.text;
  const generic = client.find((s) => s.id === "generic")!.text;
  const step3 = o.project
    ? `STEP 3 — USE MY EXISTING PROJECT
It is already created: "${o.project.name}" (${o.project.websiteUrl}), projectId ${o.project.id}. Pass that projectId to
every tool below. Do NOT create a second project. You may call usertrack_update_project to correct the category,
project type or store URLs if the repo clearly contradicts what is stored — nothing else.`
    : `STEP 3 — CREATE THE PROJECT
Call the UserTrack MCP tools to create (or find) my project: name, description, website URL, category, project type
(web / mobile / hybrid). Use what is really in this repo — package.json, the landing page copy, the README.`;
  return trim(`Set up UserTrack for this project, end to end. Work in this repository.

STEP 1 — CONNECT THE USERTRACK MCP SERVER
If you are Claude Code, run:
${claude}

Any other MCP client — register this server (Streamable HTTP):
${generic}

The token is mine, short-lived and scoped to my own UserTrack projects. It can never delete a project or read user
data. Put it in the MCP client config only: never write it into a source file, a committed .env, a README or a log.

STEP 2 — UNDERSTAND THE STACK
Read the code, not the docs. Work out: where user accounts actually live (Better Auth, Auth.js/NextAuth, Clerk,
Supabase, Firebase, Auth0, Convex, Prisma/Drizzle on Postgres …), which analytics SDK is installed (PostHog,
Plausible, GA4), and which payment provider is wired up (Stripe, Paddle, LemonSqueezy, RevenueCat …).
Tell me your conclusion in one short list before you change anything.

${step3}

STEP 4 — CONNECT THE DATA SOURCES, IN THIS ORDER
a) users — required. Prefer the native SDK (@usertrack/node or @usertrack/better-auth): my app answers signed,
   aggregate-only requests, so no database credentials ever leave this project. Ask the MCP server for the setup
   plan, add the route/plugin exactly as it returns it, add USERTRACK_PROJECT_ID and USERTRACK_SECRET to .env.example
   and to my local env file, never commit the secret, then deploy.
b) activation — optional but valuable: the event that means a user reached real value (onboarding_completed,
   project_created, first_query …). Pick one that already exists in the code.
c) conversion — optional: converted/subscribed COUNT only.

STEP 5 — VERIFY, PUBLISH AND REPORT
Verify each integration through the MCP tools and trigger the first sync. Then publish the page with
usertrack_update_project { isPublic: true }: a project stays a draft until you do, and a draft is not listed, not
ranked and its public URL returns 404. Open that URL and confirm it loads before you report back. Then give me: the
public UserTrack URL, the detected user count, and anything you could not connect and why.

HARD RULES
- UserTrack tracks users, never revenue. Never configure anything that reads MRR, invoices or amounts, and never
  hand over a key with write or delete permissions. Read-only, least privilege, always.
- Never send user records, emails or PII anywhere. UserTrack only ever wants aggregate counts.
- If a step fails, stop and show me the exact error instead of trying a workaround that widens access.${o.task ? `\n\nEXTRA INSTRUCTION FROM ME\n${o.task}` : ""}

${OUTRO}`);
}

export function activationAgentPrompt(o: { token: string; project: { id: string; name: string; websiteUrl: string }; context?: string }) {
  const client = mcpSnippets(o.token);
  const claude = client.find((s) => s.id === "claude-code")!.text;
  const generic = client.find((s) => s.id === "generic")!.text;
  const context = o.context?.trim()
    ? `\nFOUNDER CONTEXT\n${o.context.trim()}\nTreat this as a useful clue, not proof. Verify it against the product code.`
    : "";
  return trim(`Define and connect the activation event for "${o.project.name}" in UserTrack. Work in this product's repository.

CONNECT USERTRACK
If you are Claude Code, run:
${claude}

Any other MCP client — register this Streamable HTTP server:
${generic}

The existing UserTrack project is ${o.project.id} (${o.project.websiteUrl}). Pass that projectId to every UserTrack
tool. Do not create another project. The token is short-lived and scoped to the founder's projects. Keep it in the
MCP client config only; never write it to source files, committed env files, documentation or logs.${context}

FIRST: UNDERSTAND ACTIVATION
1. Inspect the actual product code: product copy, onboarding, routes, domain models, existing analytics calls and the
   actions repeated by successful users. Search for candidate event names and the records created by core workflows.
2. Activation means the earliest action where a new user has received real product value. Signup, login, pageview,
   app_open, a generic click, starting checkout or payment are not activation.
3. Prefer one existing, durable outcome event or one row-per-activated-user table. Do not invent an event merely
   because its name sounds good.
4. Briefly report the strongest candidate and why it represents value. If one candidate is clearly supported by the
   code, proceed. If two or more product meanings remain plausible, ask me exactly one concise question with the
   concrete candidates and wait for my answer before changing code or configuring UserTrack.

THEN: INTEGRATE IT
1. Detect the analytics/data stack and call usertrack_get_activation_setup with projectId "${o.project.id}",
   detectedProviders and every candidate event name you found.
2. Use the safest recommended verified source: an existing PostHog event, the existing Supabase/Postgres data via a
   read-only aggregate query, or the existing native UserTrack handler. Use the endpoint fallback only when none of
   those fits. Never use a manual/self-reported count when a verified source is possible.
3. Ask me only for a credential or deployment action that is genuinely missing. Request the least privilege possible
   and never print, log, commit or paste credentials into chat.
4. Call usertrack_get_integration_setup with role "activation", implement only the required wiring, then configure and
   verify the activation integration. The activated count must never exceed total users. Trigger a sync after success.
5. Do not change the existing users or conversion definitions, public visibility, auth behavior or billing behavior.

REPORT BACK
- The exact activation definition in one sentence.
- The event/table/query and provider used.
- Verification result and detected activated-user count.
- Any code or environment changes still requiring deployment.

${OUTRO}`);
}

export function nativeSdkAgentPrompt(o: { sourceLabel: string; source: string; packageName: string; installCommand: string; routeTitle: string; routePath: string; routeCode: string; envSnippet: string; pushCode?: string; pushPath?: string; verifyUrl: string; notes: string[] }) {
  return trim(`Install the UserTrack native SDK in this project (${o.sourceLabel}).

CONTEXT
UserTrack reads my total user count by calling one signed endpoint in MY app. No database credentials are shared,
no user records leave the app — the handler answers with aggregate counts only. Everything below was generated for
my project; use it verbatim.

1) INSTALL
${o.installCommand}
Use whichever package manager this repo actually uses (check the lockfile) and keep the same package: ${o.packageName}

2) ${o.routeTitle.toUpperCase()} — ${o.routePath}
${o.routeCode}

Adapt ONLY what is required to make it compile in this codebase (import paths, the db/client instance, the router
convention — Pages Router, Express, Hono, Fastify …). Keep the projectId, the secret, the source value and the shape
of the count sources exactly as written. If the project already has activation or conversion tables, wire the
optional activation / conversion sources too.

3) ENVIRONMENT
${o.envSnippet}
Add both keys to .env.example (with empty values) and to my local env file. Add them to the hosting provider for
every environment that should report. NEVER commit the secret and never print it.
${o.pushCode ? `\n4) OPTIONAL LIVE EVENTS — ${o.pushPath}\n${o.pushCode}\nFire-and-forget: it must never block or fail a signup.\n` : ""}
${o.notes.length ? `NOTES\n${o.notes.map((n) => `- ${n}`).join("\n")}\n` : ""}
FINALLY
- Typecheck and build.
- Deploy, then confirm the endpoint is reachable in production: ${o.verifyUrl}
- Tell me when it is live so I can press "Verify integration" in UserTrack. Do not change any auth behaviour,
  middleware order or existing route while you are in there.

${OUTRO}`);
}

export function apiKeyAgentPrompt(o: { key?: string; baseUrl?: string }) {
  const base = o.baseUrl ?? `${SITE_URL}/api/v1`;
  return trim(`Integrate the UserTrack public API into this project.

WHAT IT IS
UserTrack (${SITE_URL}) exposes public, verified SaaS growth metrics. Read-only. OpenAPI spec: ${SITE_URL}/api/openapi.json
Base URL: ${base}
Auth: Authorization: Bearer <key> (anonymous works too, at a much lower rate limit).

CREDENTIAL
${o.key ? `My key: ${o.key}\nPut it in .env.local as USERTRACK_API_KEY, add USERTRACK_API_KEY= to .env.example, and read it via\nprocess.env. Never hardcode it, never expose it to the browser (no NEXT_PUBLIC_ prefix), never commit it.` : "Read the key from process.env.USERTRACK_API_KEY. Never hardcode it and never expose it to the browser."}

WHAT TO BUILD
1. Fetch ${SITE_URL}/api/openapi.json first and use it as the source of truth for paths, parameters and response
   shapes. Do not invent endpoints.
2. Add a small typed client module in this project's existing conventions (one file, no new HTTP dependency — use
   fetch). Include: base URL from env, the Authorization header, JSON parsing, and typed responses derived from the
   spec.
3. Handle the real failure modes: 401 (bad key), 404 (unknown or private project), 429 (rate limited — respect the
   Retry-After header with a bounded retry), and network errors. Never let a failed metrics call break a page.
4. Cache responses for at least 60 seconds. The underlying data only syncs every 4 hours, so anything more frequent
   is wasted quota.
5. Call it from the server, never the browser: the key must not ship to the client.

${OUTRO}`);
}

export function webhookAgentPrompt(o: { url: string; events: string[]; verifySnippet: string; payloadExample: string; toleranceNote?: string }) {
  return trim(`Implement a UserTrack webhook receiver in this project.

WHAT IT IS
UserTrack (${SITE_URL}) POSTs a signed JSON payload to my endpoint whenever one of my subscribed events happens.
Endpoint to implement: ${o.url}
Subscribed events: ${o.events.join(", ")}

SIGNATURE VERIFICATION (do this first, before parsing anything):
${o.verifySnippet}

EXAMPLE PAYLOAD
${o.payloadExample}

REQUIREMENTS
1. Read the RAW request body. Verify the HMAC against the raw bytes — never against a re-serialized object. In
   Next.js App Router that means await req.text() and JSON.parse it only after the signature checks out. In Express
   that means express.raw({ type: "application/json" }) mounted on this route only.
2. Reject with 401 when the signature or timestamp check fails. ${o.toleranceNote ?? "Old timestamps must be rejected — that is the replay protection."}
3. Answer 2xx fast (under a few seconds). Do the real work asynchronously — a queue, a background task, or just
   fire-and-forget after the response. UserTrack retries on non-2xx, so slow handlers cause duplicate deliveries.
4. Be idempotent: store the event "id" and ignore an id you have already processed. Retries and at-least-once
   delivery are normal, not an error.
5. Switch on "type" and handle every subscribed event above, plus an unknown type (log it, still return 200).
   Read the secret from process.env.USERTRACK_WEBHOOK_SECRET; add it to .env.example, never commit the value.
6. Add a test that feeds a correctly signed body and a tampered one, and asserts 200 / 401.

${OUTRO}`);
}
