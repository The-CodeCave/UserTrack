# @usertrack/better-auth — Human To-Do

Everything needed to **publish and maintain** the npm package that the agent cannot do without a human-owned account. Engineering work (code, tests, docs, release workflow) is done; nothing below blocks UserTrack production — the plugin already works when installed from the repository (`pnpm add ../packages/better-auth` or a tarball from `pnpm pack`).

Last updated: 2026-09-03 (v0.7: the package is now `0.2.0` and depends on `@usertrack/protocol` + `@usertrack/node` — **publish those two first**, see `packages/node/HUMAN_TODO.md`; the workflow file is now `.github/workflows/release-packages.yml` and covers all three packages).

---

### Claim the `@usertrack` npm scope

**Why this is needed**
The package is named `@usertrack/better-auth`. Scoped packages can only be published by the owner of the scope. On 2026-09-02 `npm org ls usertrack` answered *Scope not found*, i.e. nobody owns `@usertrack` yet — claim it before someone else does.

**Where**
https://www.npmjs.com → sign in → https://www.npmjs.com/org/create

**Steps**
1. Create (or sign in to) the npm account that should own UserTrack packages (recommended: a shared `codecave` account with 2FA, not a personal one).
2. **Create organization** → name `usertrack` → plan *Free (public packages)*.
3. Add yourself (and any maintainer) as **Owner**. Enable **two-factor auth** for all members (npm requires it for publishing scoped packages with provenance).
4. If `usertrack` is taken, the fallback name is `@codecave/better-auth-usertrack` — change `name` in `packages/better-auth/package.json`, the install commands in `convex/lib/betterAuthSetup.ts` (`PACKAGE_NAME`) and the docs.

**Value / configuration required**
Organization `usertrack` on npmjs.com with at least one owner.

**Where to put it**
Nothing in the codebase unless the name changes.

**Status**
* [ ] Pending

---

### Configure trusted publishing (OIDC) for GitHub Actions — or an `NPM_TOKEN`

**Why this is needed**
`.github/workflows/release-packages.yml` builds, tests, packs and publishes the package with `npm publish --provenance --access public` whenever a tag `better-auth-v*` (or `protocol-v*` / `node-v*` for the sibling packages) is pushed. Provenance requires either npm **Trusted Publishing** (no long-lived secret, recommended) or a granular automation token stored as a GitHub secret.

**Where**
npm: https://www.npmjs.com/package/@usertrack/better-auth/access (available after the first publish) · GitHub: https://github.com/The-CodeCave/UserTrack/settings/secrets/actions

**Steps**
Option A — trusted publishing (recommended, works from the second release on):
1. Do the first publish manually from a laptop (next item).
2. npm → package → **Settings → Trusted publishers → GitHub Actions** → organization `The-CodeCave`, repository `UserTrack`, workflow `release-packages.yml`, environment `npm` (repeat the trusted-publisher entry for `@usertrack/protocol` and `@usertrack/node`).
3. GitHub → repo → Settings → Environments → create `npm` (optionally require a reviewer = release approval gate).
4. Nothing else: the workflow already has `permissions: id-token: write` and uses `npm publish --provenance`.

Option B — automation token:
1. npm → Access Tokens → **Generate new token → Granular** → packages & scopes: `@usertrack` read/write, *bypass 2FA* for automation, 1-year expiry.
2. GitHub → Settings → Secrets → Actions → `NPM_TOKEN` = the token.
3. The workflow picks `NPM_TOKEN` up automatically if present (`NODE_AUTH_TOKEN`).

**Value / configuration required**
Either a trusted-publisher entry on npm, or the secret `NPM_TOKEN`.

**Where to put it**
npm package settings (A) or GitHub Actions secrets (B).

**Status**
* [ ] Pending

---

### First publish (`0.2.0`)

**Why this is needed**
The first version of a scoped package must be published by a scope owner; trusted publishing can only be attached afterwards. The package is publish-ready: `pnpm -r --filter "./packages/**" build && pnpm --filter @usertrack/better-auth test` pass and `pnpm pack` produces a tarball containing only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `AGENTS.md`, `llms.txt` and `package.json` (checked 2026-09-03). `0.1.0` was never published; start with `0.2.0`, **after** `@usertrack/protocol@0.1.0` and `@usertrack/node@0.1.0` are on npm (the `workspace:^` ranges become `^0.1.0` at pack time and must resolve).

**Where**
Your laptop, repository root.

**Steps**
1. `npm login` (account that owns `@usertrack`, 2FA ready).
2. `pnpm install && pnpm -r --filter "./packages/**" build && cd packages/better-auth && pnpm test`
3. `pnpm pack --pack-destination /tmp && tar -tzf /tmp/usertrack-better-auth-0.2.0.tgz` — confirm the file list above.
4. `npm publish --access public --provenance=false` (provenance only works from CI).
5. Verify: `npm view @usertrack/better-auth` — then run the example: `cd packages/better-auth/e2e && pnpm e2e` (uses the workspace build) or install the published tarball in any Better Auth app.
6. Tag the release so the changelog and GitHub release match: `git tag better-auth-v0.2.0 && git push origin better-auth-v0.2.0` (the workflow will run; with neither OIDC nor `NPM_TOKEN` configured the publish step fails harmlessly because the version already exists — that is expected for this first manual release).

**Value / configuration required**
npm credentials only.

**Where to put it**
Nowhere — interactive login.

**Status**
* [ ] Pending

---

### Subsequent releases (approval)

**Why this is needed**
Releases are tag-driven. A human decides when to cut one; the agent maintains `CHANGELOG.md` and bumps `version` in `package.json` + `src/version.ts` (a test asserts both match).

**Where**
GitHub → Actions → *Release @usertrack/better-auth* · npm

**Steps**
1. Merge the version bump on `main` (`packages/better-auth/package.json`, `packages/better-auth/src/version.ts`, `CHANGELOG.md`).
2. `git tag better-auth-v<version> && git push origin better-auth-v<version>`.
3. If the `npm` environment requires a reviewer, approve the deployment in GitHub → Actions.
4. Check the run: build ✓ tests ✓ `npm pack --dry-run` file list ✓ publish ✓; then `npm view @usertrack/better-auth version`.

**Value / configuration required**
None.

**Status**
* [ ] Recurring

---

### Submit the plugin to the Better Auth community plugin list

**Why this is needed**
Better Auth maintains a community plugins page in its docs (https://www.better-auth.com/docs/plugins/community-plugins, source: `docs/content/docs/plugins/community-plugins.mdx` in https://github.com/better-auth/better-auth). Being listed there is the main discovery channel for Better Auth users. Submission is a pull request from a GitHub account, so a human has to open it (or approve the agent opening it from your account).

**Where**
https://github.com/better-auth/better-auth → fork → edit `docs/content/docs/plugins/community-plugins.mdx` → pull request

**Steps**
1. Publish `0.1.0` first (npm link must resolve).
2. Add one row to the community table, alphabetically by name:
   `| [UserTrack](https://usertrack.dev/developers/integrations/better-auth) | Verified registered-user growth metrics for UserTrack — aggregate counts only, no PII. | [@usertrack/better-auth](https://www.npmjs.com/package/@usertrack/better-auth) |`
   (match the exact column layout of the current file; it has changed between versions).
3. PR title: `docs: add @usertrack/better-auth to community plugins`. Mention: MIT, ESM, `better-auth >=1.3`, endpoint `POST /usertrack/metrics`, tests included.
4. Optional: post in the Better Auth Discord `#showcase` channel.

**Value / configuration required**
GitHub account.

**Where to put it**
Pull request URL → `docs/CHANGELOG.md` under the next release notes.

**Status**
* [ ] Pending

---

### Package ownership and maintainers

**Why this is needed**
Bus-factor: at least two humans should be able to publish.

**Where**
https://www.npmjs.com/settings/usertrack/members

**Steps**
1. Add a second owner to the `usertrack` org.
2. Turn on **"Require two-factor authentication to publish"** in the package settings.

**Status**
* [ ] Pending
