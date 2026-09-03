# @usertrack/node — for coding agents

Goal: make this app a **native, verified** UserTrack source. Install the package, mount one signed handler, set two env vars, deploy, verify. Aggregate counts only; never send user rows, emails or names.

## Exact steps

1. Get the credential: UserTrack dashboard (project → Integrations → Users → *My app (SDK)*) or MCP `usertrack_create_integration { provider: "native", source: "<prisma|drizzle|convex|authjs|custom>" }`. The secret (`ut_int_…`) is shown once.
2. Install with the repo's package manager: `npm install @usertrack/node` / `pnpm add @usertrack/node` / `yarn add @usertrack/node` / `bun add @usertrack/node`.
3. Add the env vars to `.env.example` (empty) and to the git-ignored local env + the hosting provider (every environment that serves the product):
   ```
   USERTRACK_PROJECT_ID=
   USERTRACK_SECRET=
   ```
4. Mount the handler so that `POST <base>/metrics` is reachable (default base `https://<app>/api/usertrack`):
   - Next.js (App Router): `app/api/usertrack/metrics/route.ts`
     ```ts
     import { createUserTrackHandler } from "@usertrack/node";
     import { prismaUsers } from "@usertrack/node/prisma";      // or drizzleUsers / your own count()
     import { prisma } from "@/lib/prisma";
     export const POST = createUserTrackHandler({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET!, source: "prisma", users: prismaUsers(prisma.user) });
     ```
   - Express: `app.post("/api/usertrack/metrics", toNodeHandler(createUserTrackHandler({ … })))`
   - Hono: `app.post("/api/usertrack/metrics", (c) => usertrack(c.req.raw))`
   - Convex: route `/usertrack/metrics` in `convex/http.ts` with `httpAction(convexHandler({ projectId, secret, users: internal.usertrack.countUsers }))` and a `countUsers` internal query built with `countWithCap` (see README). Base URL = the Convex site URL.
5. Optional: `activation: <CountSource>` (a table with one row per activated user) and `conversion: { converted: <CountSource>, trial?: <CountSource>, mode?: "active_paid" }`. Optional push: Prisma `$extends(userTrackPrismaExtension({ projectId, secret }))`, Auth.js `events: { ...userTrackAuthjsEvents({ projectId, secret }) }`, or `createTracker(...).track("user.created", { id })` after your own insert.
6. Run the repo's typecheck/tests. Deploy.
7. Verify: dashboard **Verify** button or MCP `usertrack_verify_integration { projectId, role: "users" }`. 404 = handler not mounted / not deployed; 401 = env vars differ from the integration; stale = clock skew.

## Rules
- Do not change authentication, billing or database code beyond adding the handler and (optionally) the push hook.
- Never hardcode, print, log or commit the secret.
- A count source is `{ count({ createdAtGte?, createdAtLt? }) => Promise<number | { count, exact }> , timeFilter?: boolean }`. Return only counts.
- Identities (optional) must be opaque user ids — never emails.

## API surface
`createUserTrackHandler`, `toNodeHandler`, `createTracker`, `handleMetrics` (framework-agnostic core), `countSource`; sub-exports `@usertrack/node/prisma` (`prismaUsers`, `userTrackPrismaExtension`), `@usertrack/node/drizzle` (`drizzleUsers`), `@usertrack/node/convex` (`convexHandler`, `countWithCap`), `@usertrack/node/authjs` (`userTrackAuthjsEvents`).
