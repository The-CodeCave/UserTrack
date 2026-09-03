# @usertrack/better-auth — for coding agents

Official UserTrack plugin for Better Auth. One plugin, two env vars, deploy, verify. Aggregate counts only; never user rows.

## Exact steps
1. Credential: UserTrack dashboard (project → Integrations → Users → Better Auth) or MCP `usertrack_create_integration { provider: "native", source: "better-auth" }`. The secret (`ut_int_…`) is shown once.
2. Install with the repo's package manager: `npm install @usertrack/better-auth` / `pnpm add …` / `yarn add …` / `bun add …` (peer `better-auth >= 1.3`).
3. Locate the file calling `betterAuth({ ... })` (lib/auth.ts, src/lib/auth.ts, auth.ts, server/auth.ts, convex/auth.ts). Do not create a second instance. Append to the existing `plugins` array — never replace, reorder or remove other plugins or options:
   ```ts
   import { userTrack } from "@usertrack/better-auth";
   plugins: [ /* existing */ userTrack({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET! }) ]
   ```
4. Env: add `USERTRACK_PROJECT_ID` and `USERTRACK_SECRET` to `.env.example` (empty) and set the real values in the git-ignored local env and every hosting environment. Never hardcode or commit the secret.
5. Typecheck, test, deploy. The endpoint must be live at `<Better Auth base URL>/usertrack/metrics` (usually `https://<app>/api/auth/usertrack/metrics`).
6. Verify: dashboard **Verify** or MCP `usertrack_verify_integration { projectId, role: "users" }`. 404 = plugin not deployed; 401 = env vars differ; stale = clock skew.

## Options
`userTrack({ projectId, secret, endpoint? = "https://usertrack.dev", events? = true, debug? = false })`. Anonymous-plugin users are excluded automatically. To also report activation / conversion from the same app, use `@usertrack/node` with `betterAuthUsers(adapter, { excludeAnonymous })` as the users source.
