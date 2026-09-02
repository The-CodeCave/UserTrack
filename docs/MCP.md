# UserTrack MCP server

UserTrack exposes its founder-side functionality (projects, data sources, metrics, share URLs) as a [Model Context Protocol](https://modelcontextprotocol.io) server. An AI coding agent running inside a SaaS repository can detect the stack, create the UserTrack project, connect a read-only data source, verify it, publish the growth page and report on it afterwards — without the founder touching the dashboard.

The MCP server, the dashboard and the public API all call the same domain layer (`convex/domain/*`), so an agent sees exactly what the founder sees.

## Endpoint

| | |
| --- | --- |
| URL | `https://usertrack.dev/mcp` (self-hosted: `${NEXT_PUBLIC_SITE_URL}/mcp`) |
| Transport | Streamable HTTP, **stateless** (no session id, no server-initiated streams) |
| Responses | JSON (`enableJsonResponse`), one server instance per request |
| Methods | `POST` JSON-RPC · `GET` discovery document (JSON) · `OPTIONS` CORS preflight |
| Server name / version | `usertrack` / `1.0.0` |

`GET /mcp` without `Accept: text/event-stream` returns a human/crawler-readable discovery document: name, endpoint, auth scheme, tool list and setup workflow. `GET` with an event-stream accept header and `DELETE` return `405` with a JSON-RPC error explaining that the server is stateless.

## Authentication

```
Authorization: Bearer ut_mcp_…
```

- Only **MCP tokens** (`ut_mcp_` prefix) are accepted. Public API keys (`ut_api_`) are rejected with `401`.
- A missing or malformed token returns `401` with a JSON-RPC error and a `WWW-Authenticate: Bearer realm="UserTrack MCP", error="invalid_token"` header.
- Revoked, expired or scope-less tokens pass the HTTP layer but every tool call returns a structured error (see [Errors](#errors)).

### Creating a token

1. Sign in and open `https://usertrack.dev/app/developer`.
2. **Create MCP token**, give it a name, pick scopes (all six by default), optionally an expiry (max 365 days).
3. Copy the secret; it is shown once. Only its SHA-256 hash is stored, plus the first 4 characters after the prefix (`ut_mcp_a8f3`) for identification.

Tokens created from the onboarding "Set up with AI" flow get the default scopes and expire after 7 days; the dashboard shows live setup progress derived from that token's audit trail. Up to 25 active tokens/keys per account. Revoke any time from the same page.

## Scopes

| Scope | Grants | Tools |
| --- | --- | --- |
| `profile:read` | Founder profile and account summary | `usertrack_get_account` |
| `projects:read` | List and inspect projects, integration state, verification | `usertrack_get_projects`, `usertrack_get_project` |
| `projects:write` | Create projects, edit metadata, publish. Never deletes. | `usertrack_create_project`, `usertrack_update_project` |
| `integrations:read` | Provider catalog and setup instructions | `usertrack_get_supported_integrations`, `usertrack_get_integration_setup` |
| `integrations:write` | Connect data sources, verify, trigger syncs | `usertrack_configure_integration`, `usertrack_verify_integration`, `usertrack_sync_project` |
| `metrics:read` | Metrics, history, ranks, milestones, share URLs | `usertrack_get_metrics`, `usertrack_get_growth_history`, `usertrack_get_rank`, `usertrack_get_milestones`, `usertrack_get_share_url` |

Recommendation: all six scopes for onboarding (the default). A reporting-only agent (weekly summaries, launch posts) needs `projects:read` + `metrics:read`.

## Tools

Every tool takes a project reference `{ projectId?: string, slug?: string }` where noted (`ref`); either is accepted and ownership is enforced on both. All tools are annotated `idempotentHint: true`, `destructiveHint: false`. Results are returned as JSON text plus `structuredContent`.

| Tool | Scope | Mode | Input | Output (summary) |
| --- | --- | --- | --- | --- |
| `usertrack_get_account` | `profile:read` | read | — | `profile` (username, display name, links, email, onboardingCompleted, url), `token` (name, prefix, scopes, createdAt), `projectCount`, `projects[]` (id, slug, name, isPublic, verification, totalUsers, url). Call first. |
| `usertrack_get_projects` | `projects:read` | read | — | Array of project summaries: metadata, `isPublic`, `verification {level,label,score}`, `metrics`, `ranks`, `lastSyncedAt`, `createdAt`, `urls`. |
| `usertrack_get_project` | `projects:read` | read | `ref` | Project summary + `urls` + `integrations[]` (role, provider, status, trust, lastError, timestamps, secret-free `publicConfig`) + `setup` (`hasUsersSource`, `usersSourceStatus`, `firstSyncDone`, `published`, `underReview`, `nextStep`). |
| `usertrack_create_project` | `projects:write` | write | `name`, `websiteUrl`, `description?`, `category?`, `tags?` (≤5), `logoUrl?`, `detectedStack?` | `created: true|false`, `project`, `recommendation` (best users source + optional extras), `warnings[]`. If the account already has a project for the same domain: `created: false`, `duplicateOf`, existing project. |
| `usertrack_update_project` | `projects:write` | write | `ref`, `name?`, `description?`, `websiteUrl?`, `category?`, `tags?`, `logoUrl?`, `newSlug?`, `isPublic?` | `updated[]` (changed fields), `project`. `isPublic: true` publishes and triggers a rerank. |
| `usertrack_get_supported_integrations` | `integrations:read` | read | `detectedProviders?[]`, `framework?` | `providers[]` (catalog: roles, trust, summary, detects, credential keys, permissions, reads, neverSent) + `recommendation` (`recommended`, `alternatives`, `optionalExtras`, `detected`, `reasoning`). |
| `usertrack_get_integration_setup` | `integrations:read` | read | `ref?`, `provider`, `role?`, `framework?`, `detectedProviders?[]` | Executable plan: `requirements[]` (where to find each credential, env var hints), `permissions`, `reads`, `steps[]` (`collect_credential` / `ask_user` / `modify_repo` / `deploy` / `call_tool` / `verify`), `securityRules`, `configShape`, `codeTemplates[]` (endpoint provider), `verification` call, `nextTool`. |
| `usertrack_configure_integration` | `integrations:write` | write | `ref`, `provider`, `role?` (default `users`), `config` | `integration` (secret-free view), `message`, `nextTool: usertrack_verify_integration`. Validates the config, encrypts secrets, starts the first sync. Replaces the existing source for that role. |
| `usertrack_verify_integration` | `integrations:write` | write | `ref`, `role?`, `provider?`, `config?` | `connected`, `status` (`connected` / `failed` / `missing` / `invalid_config`), `detected {count, metrics}`, `verificationLevel`, `verificationLabel`, `durationMs`, `stored`, `project`, `nextTool`, `hint`; on failure `error`, `retryable`, `missingRequirements`. Pass `provider` + `config` to test before saving. |
| `usertrack_sync_project` | `integrations:write` | write | `ref`, `role?` | `started` (number of sources), `message`, `nextTool`. |
| `usertrack_get_metrics` | `metrics:read` | read | `ref`, `timeframe?` (`24h` / `7d` default / `30d`) | `totalUsers`, `window` (new users vs previous window, `changeVsPreviousPct`, growth %, activated, trending score), `windows` (all three), `activated`, `retention`, `ranks` (+ movement, best), `verification`, `streakDays`, `lastSyncedAt`, `recentMilestones[]` (3). |
| `usertrack_get_growth_history` | `metrics:read` | read | `ref`, `range?` (`24h` `7d` `30d` default `90d` `1y` `all`) | `points[] { t, totalUsers, newUsers, activatedUsers?, visitors? }`. Snapshots for 24h/7d, daily rows otherwise. |
| `usertrack_get_rank` | `metrics:read` | read | `ref` | `eligible`, `reason` (why not ranked), leaderboard/trending positions with previous + movement, `best`, `boards` URLs, `trendingScore7d`. |
| `usertrack_get_milestones` | `metrics:read` | read | `ref`, `limit?` (1–50, default 20) | `milestones[] { id, key, kind, metric, value, title, copy, achievedAt, sharePage, shareImage }`. |
| `usertrack_get_share_url` | `metrics:read` | read | `ref` | `page`, `profile`, `badge`, `ogImage`, `api`, `share{users,growth,rank,trending,activation}`, `shareImages`, `milestoneShares[]`, `headline`, `nextSyncWithinMs`; `note` if not published. |

### Prompt

`add_project_to_usertrack` — a single user message containing the agent prompt:

> Add this project to UserTrack. Detect the current authentication/user stack, choose the safest supported UserTrack integration, configure it, verify it, and return the public UserTrack URL.

### Server instructions

The server sends instructions on `initialize` that describe UserTrack, the ordered setup workflow below, and four rules: never print or log credentials; prefer verified providers over manual numbers; only aggregate counts are ever sent to UserTrack; ask the founder for any credential not found in the repo's env files.

## The agent-native setup flow

The workflow the server asks agents to run, in order:

1. `usertrack_get_account`
2. `usertrack_get_supported_integrations` (pass `detectedProviders` + `framework` from the repo)
3. `usertrack_create_project` (idempotent by domain)
4. `usertrack_get_integration_setup` (recommended provider)
5. edit the repo only if the instructions say so (endpoint provider)
6. `usertrack_configure_integration`
7. `usertrack_verify_integration` (wait ~5s, retry ≤3×)
8. `usertrack_update_project { isPublic: true }`
9. `usertrack_get_share_url` → hand the public URL to the founder

What the agent does in the repository:

- Reads `package.json`, lock files and `.env*` names (not values it would print) to detect the auth/analytics stack: Clerk, Supabase, Firebase, Auth0, PostHog, Plausible, GA4, Stripe, or a generic database/auth library (Better Auth, NextAuth, Lucia, Convex, Prisma, Drizzle, Mongoose, …).
- Provider priority for the `users` role: Clerk → Supabase → Auth0 → Firebase → JSON endpoint → manual. When no supported auth provider is detected, the recommendation is a small JSON endpoint on the product's own domain.
- For the **endpoint** provider only, the agent adds one read-only route (template provided per framework/ORM, e.g. `app/api/usertrack/route.ts`) that returns `{ "totalUsers": n }` behind a bearer token, adds `USERTRACK_ENDPOINT_TOKEN` to the environment, and asks the founder to deploy. The route is `verified` only when it lives on the product's domain.
- For every other provider it locates the credential (env var hints and dashboard paths are in the setup instructions), asks the founder if it is missing, and passes it straight into `usertrack_configure_integration`.
- Optional extras suggested after the users source is verified: PostHog or a Supabase table for activation, Plausible / GA4 for traffic, Stripe for revenue (traffic and revenue stay private unless the founder opts in).

Security rules attached to every setup plan: least-privilege credentials only; credentials never printed, logged, committed or pasted into chat; only aggregate counts are sent; no changes to auth, billing or database code beyond the optional count endpoint; never guess or create credentials without telling the founder.

## Client configuration

Replace `ut_mcp_…` with your token.

**Claude Code** (run inside the SaaS repository, then start `claude`):

```bash
claude mcp add --transport http usertrack https://usertrack.dev/mcp --header "Authorization: Bearer ut_mcp_…"
```

**Cursor** (`.cursor/mcp.json` in the repository, or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "usertrack": {
      "url": "https://usertrack.dev/mcp",
      "headers": { "Authorization": "Bearer ut_mcp_…" }
    }
  }
}
```

**Codex CLI** (reads the token from the environment):

```bash
codex mcp add usertrack --url https://usertrack.dev/mcp --bearer-token-env-var USERTRACK_MCP_TOKEN
export USERTRACK_MCP_TOKEN=ut_mcp_…
```

**VS Code / Copilot** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "usertrack": {
      "type": "http",
      "url": "https://usertrack.dev/mcp",
      "headers": { "Authorization": "Bearer ut_mcp_…" }
    }
  }
}
```

**Any MCP client:** Streamable HTTP transport at `https://usertrack.dev/mcp`, token as a Bearer header. The same snippets, with the token filled in, are shown on `/app/developer` right after a token is created.

## Example conversations

**Onboarding**

> Add this project to UserTrack. Detect the current authentication/user stack, choose the safest supported UserTrack integration, configure it, verify it, and return the public UserTrack URL.

Agent: `get_account` → `get_supported_integrations { detectedProviders: ["@clerk/nextjs", "posthog-js"], framework: "nextjs" }` → `create_project { name, websiteUrl, detectedStack }` → `get_integration_setup { provider: "clerk" }` → finds `CLERK_SECRET_KEY` in `.env.local` → `configure_integration { provider: "clerk", config: { secretKey } }` → waits 5 s → `verify_integration` → `update_project { isPublic: true }` → `get_share_url` → "Your page is live at https://usertrack.dev/s/acme. PostHog was detected; want me to add activation tracking?"

**Weekly report**

> How did my SaaS perform this week?

Agent: `get_projects` → `get_metrics { slug: "acme", timeframe: "7d" }` → `get_rank { slug: "acme" }` → "312 new users this week vs 241 last week (+29%), activation 39%, moved from #6 to #4 on the leaderboard, #9 trending."

**Launch post**

> Write a post about my biggest milestone.

Agent: `get_milestones { slug: "acme", limit: 10 }` → picks the largest `users` threshold → `get_share_url` → drafts the post with the milestone copy and attaches `sharePage` / `shareImage`.

## Idempotency

| Operation | Behaviour on repeat |
| --- | --- |
| `usertrack_create_project` | Same owner + same canonical domain (lowercased, `www.` stripped) returns the existing project with `created: false` and `duplicateOf`. No duplicates from retries. |
| `usertrack_configure_integration` | Replaces the source for that role. Historical snapshots are kept. |
| `usertrack_update_project` | Partial patch; unchanged fields are not touched. `bad_request` if nothing would change. |
| `usertrack_verify_integration` | Read-only against the provider; safe to repeat after the cooldown. |
| Read tools | Pure reads. |

## Rate limits

Reads are generous, writes are conservative.

| Limit | Value | Error |
| --- | --- | --- |
| Daily quota | 5,000 tool calls per token per UTC day (counted per tool name) | `rate_limited`, `retryAfterSec` until midnight UTC |
| Burst | 60 tool calls per minute per token (in-process bucket) | `rate_limited` |
| Create project | ≤ 10 new projects per hour per token (duplicates returned via idempotency do not count) | `rate_limited`, `retryAfterSec: 3600` |
| Verify | 20 s cooldown per project | `rate_limited`, remaining seconds |
| Sync now | 60 s cooldown per data source | `rate_limited`, remaining seconds |

Rate-limit results include a hint telling the agent to wait and not to loop.

## Errors

Tool failures are returned as tool results with `isError: true`, so the agent can read them without the transport failing:

```json
{
  "error": {
    "code": "forbidden",
    "message": "This token is missing the integrations:write scope",
    "requiredScope": "integrations:write",
    "scopes": ["projects:read", "metrics:read"],
    "hint": "Ask the founder for a token with the integrations:write scope (UserTrack → Developer → MCP tokens)."
  }
}
```

| `code` | Meaning | Hint given to the agent |
| --- | --- | --- |
| `unauthorized` | Token unknown, wrong type, or gateway secret mismatch | Create a new MCP token and update the config |
| `revoked` | Token was revoked | same |
| `expired` | Token passed its expiry | same |
| `forbidden` | Missing scope (`requiredScope` is set) | Ask for a token with that scope |
| `rate_limited` | Quota, burst or cooldown (`retryAfterSec` is set) | Wait, do not loop |
| `not_found` | Project not found or not owned by this token | Call `usertrack_get_projects` |
| `bad_request` | Invalid input (unknown provider/role, invalid config, unknown category, nothing to update) | — |
| `conflict` | No free slug could be found | — |
| `internal` | Unexpected failure | — |

## Security model

- **Hashed tokens.** Secrets are 40 random base62 characters after the prefix (≈238 bits); only the SHA-256 hash is stored and looked up. Shown once at creation.
- **Scopes.** Every tool declares one scope; the gateway checks it on every call.
- **Ownership.** Every project reference (id or slug) is resolved and checked against the token owner. Ids alone are never trusted.
- **No deletion.** No tool deletes a project, an integration or a token.
- **Secrets never returned.** Provider credentials are validated, stored encrypted and exposed only as a masked `publicConfig`. Tool results, audit entries and the dashboard never contain them.
- **Gateway secret.** Next.js signs every backend call with `UT_GATEWAY_SECRET`; the Convex gateway rejects calls without it, so token hashes cannot be replayed against the backend directly.
- **Aggregate data only.** Providers are read with count-only endpoints; no emails, names, sessions or per-user rows.

## Audit logging

Every token-authenticated write (`create_project`, `update_project`, `configure_integration`, `verify_integration`, `sync_project`) and every token lifecycle event (`mcp_token_created`, `api_key_created`, `token_revoked`) is recorded with the token, project, outcome and a short detail string. The developer page shows the last 50 entries; the onboarding page uses the same trail to render live setup progress ("Agent connected → Project created → Connecting clerk → Verifying data → First sync complete → Published"). Reads are counted in per-day usage buckets but not logged individually.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| HTTP `401` on every request | No `Authorization` header, token not starting with `ut_mcp_`, or an API key used for MCP | Create an MCP token at `/app/developer`; check the header reaches the server (some clients need the header in `headers`, Codex needs the env var) |
| Tool error `unauthorized` / `revoked` / `expired` | Token deleted, revoked or past expiry (onboarding tokens: 7 days) | Create a new token, update the client config, restart the client |
| Tool error `forbidden` | Token created with a subset of scopes | Create a token with the scope named in `requiredScope` |
| Tool error `rate_limited` | Burst, daily quota, project-creation cap or a verify/sync cooldown | Wait `retryAfterSec`; agents should not retry in a loop |
| Tool error `not_found` | Wrong slug/id, or the project belongs to another account | `usertrack_get_projects` |
| `verify_integration` returns `status: "failed"` with `retryable: false` | Wrong credential or insufficient permissions | Re-read `requirements`/`permissions` from `usertrack_get_integration_setup`, reconfigure |
| `verify_integration` returns `verificationLevel: "unverified"` for an endpoint | The endpoint host differs from the product domain | Host the route on the product domain; otherwise the project is labelled self-reported and never ranked |
| Public URL 404s | Project not published | `usertrack_update_project { isPublic: true }` |
| Client tries to open an SSE stream and fails | Server is stateless | Use a client that supports Streamable HTTP with JSON responses; the discovery document at `GET /mcp` confirms the transport |

## FAQ

**Does the agent need write access to my repo?** Only for the JSON-endpoint provider, where it adds one read-only route. For Clerk, Supabase, Firebase, Auth0 and the analytics providers it only reads env var names to locate credentials.

**Can an agent delete my project?** No. There is no delete tool. `update_project` can unpublish (`isPublic: false`) but never removes data.

**What if the agent runs the setup twice?** `create_project` returns the existing project for the same domain; `configure_integration` replaces the source for that role. Nothing is duplicated.

**Can I use the same token in several agents?** Yes, but one token per agent or machine makes revocation and the audit trail cleaner.

**Does the MCP server return public data for other products?** No. All tools are scoped to projects owned by the token. Use the public API (`docs/API.md`) for other products.

**Is there OAuth?** Not yet; bearer tokens created in the dashboard are the only auth method today. OAuth for MCP clients is on the roadmap.

**Where is the source?** `src/app/mcp/route.ts` (HTTP adapter), `src/lib/mcp/server.ts` (server + per-request transport), `src/lib/mcp/tools.ts` (tool definitions), `convex/gateway.ts` (auth, scopes, quotas, audit), `convex/lib/integrationSetup.ts` (catalog and setup plans).
