# Design system reference

Dark-only product (no light theme — do not add one). Tailwind v4, CSS-first tokens: everything
lives in `src/app/globals.css` (`@theme inline` + `:root`). There is no `tailwind.config.*`.

This doc is the permanent record of the `landing-v2` design decisions (list-first layout, brand
color discipline) merged into `main` at commit `a1718af`. The scratch files that originally
captured this work, `.codecraft-loop-env.md` / `.codecraft-loop-spec.md`, are gitignored
(`.gitignore` → `# codecraft loop notes`) and local-only — do not rely on them existing.

## Token system (`src/app/globals.css`)

| Token(s) | Meaning | Where it may be used |
|---|---|---|
| `--pink` / `--pink-50`…`--pink-950` (`--pink` = `--pink-500` = `#fb0184`) | The one brand color | **Only**: the wordmark, primary CTA buttons (`src/components/ui/*` primitives), and the #1–#3 podium rank marks (e.g. `position <= 3 ? "text-pink" : "text-muted-foreground"` in `src/components/public/saas-card.tsx`) |
| `--color-trust` / `--color-trust-foreground` (blue, `#4da3ff`) | Verified / trust badges | `TrustBadge` "Verified" / "Partially verified" states |
| `--color-positive` (mint, `#34d399`) / `--color-negative` (coral, `#ff6b6b`) | Growth movement | Up/down deltas (`MovementTag`). Neutral/unchanged stays muted gray, never pink |
| `--color-new` (amber, `#fbbf24`) | New / rising tags | "New" and rising badges, e.g. `#{n} trending` chip in `saas-card.tsx` |
| default foreground (`--foreground` / `--muted-foreground`) | Plain data | Ordinary metric numbers (user counts, rates, etc.) render in foreground, never pink |

**Rule: new pink usage on data or UI outside brand/CTA/podium is a bug, not a style choice.**
If you're about to add `text-pink` / `bg-pink` / `border-pink` to anything that isn't the
wordmark, a primary CTA, or a #1–3 rank mark, use one of the semantic tokens above instead — or
plain foreground if it's just a number.

All tokens are registered in the `@theme inline` block, so `text-*`/`bg-*`/`border-*` Tailwind
utilities exist for each (`text-trust`, `bg-positive`, `border-new`, etc.) exactly like the
pre-existing `text-pink`.

## Surfaces: compliant vs not yet migrated

**Already follow the token system** (this is the reference for how new public surfaces should look):
- `src/components/public/**`
- `src/components/blueprint/**`
- The main landing page, `src/app/(public)/page.tsx`

**Still on plain/all-pink styling — migrate to the token system whenever next touched, don't do a
blanket sweep speculatively:**
- `src/lib/og/**` — OG/share-card image renderers, pink used for line/wash regardless of context
- `src/lib/widget.ts` — embeddable widget script (changing this affects other people's live sites;
  touch with care, probably a deliberate/versioned change, not a drive-by)
- `src/app/app/**` — the entire logged-in app (dashboard, settings, onboarding, TrustMRR import
  row, etc.)
- `apps/waitlist/**` — see "known redesign debt" below; it has its own, separately-hardcoded token
  subset in `apps/waitlist/src/index.css` (not shared with the main app's `globals.css`)
- Anywhere else still using `--pink`/`#fb0184` for every accent (chart wash in
  `docs/ARCHITECTURE.md`'s growth chart description, Share Studio "Blueprint"/"Aurora" presets in
  `docs/SHARING.md` — these are deliberate brand chart/card styling, not the list/board-density
  concern D2 was about, but worth a look if those surfaces are ever redesigned)

## List-first landing philosophy (D1) — reference pattern for future listing pages

Any future public listing/browsing page should follow the same shape the homepage uses:
compact hero → optional highlight carousel (hidden entirely if empty — never a placeholder) →
static tab/filter bar → dense table (44–48px rows) → compact supporting sections → final CTA.
Rules that generalize:
- Density over decoration: the list must be visible with minimal scrolling.
- Never pad short lists with fake rows. If real rows run out before the target count, add exactly
  one ghost/CTA row (e.g. "#{n+1} — this could be your SaaS, list it free"), nothing further.
- Prefer `revalidate = <n>` (ISR) over `force-dynamic` unless the page genuinely needs per-request
  freshness.
- Consolidate data fetching into one round trip per page rather than N parallel queries.

## Known redesign debt (prioritized, from the Sep 2026 post-launch review)

Findings from auditing everything that shipped on `main` after the `landing-v2` merge
(`a1718af`) but before this doc was written (commits `e2fc614`..`fa837d5`: FIX-1 through FIX-4,
the waitlist merge, SHIP-2).

1. **`apps/waitlist` — not worth it yet.** A small standalone Vite/React/Convex page (own
   `pnpm-workspace.yaml`, lockfile, Convex project, Railway service — deliberately isolated per
   `README.md` → "apps/waitlist — the interim landing") now live at usertrack.dev while the main
   app is pre-launch. It hardcodes its own minimal token subset in `apps/waitlist/src/index.css`
   (`--color-pink: #fb0184` etc.) rather than importing `globals.css`, and uses pink only for
   brand-adjacent things: one emphasis word in the H1, the join button, input focus rings, and
   decorative dividers on the Impressum page. It has no data table or growth metrics, so the D2
   pink-discipline concern (pink leaking onto plain data) doesn't really apply here. It's
   explicitly temporary — `README.md` documents the DNS handover back to the main app at launch —
   so migrating it onto shared tokens isn't worth the effort unless it ends up living much longer
   than planned.
2. **Verification / release notes — no new public-facing surface found.** SHIP-1/SHIP-2's
   "verification" refers to the QA/testing pass (lint/typecheck/test/build + smoke scripts), not a
   new UI. The actual email-verification UI ("Check your inbox" / resend notice in
   `src/components/auth/auth-form.tsx`) is from the earlier SEC-1 ticket, predates `landing-v2`,
   and is unchanged since — out of scope for this review. "Release notes" is `docs/RELEASE-v1.0.md`,
   a repo-internal markdown file, not a routed page — nothing to check for pink usage.
3. **`trustmrr.status` (FIX-4) — not a UI change.** FIX-4 only added a founder-profile
   requirement to the Convex query (`convex/trustmrr.ts`); no page or component changed. The
   TrustMRR import UI (`src/components/app/trustmrr-import.tsx`) lives under `src/app/app/**`,
   already listed above as known-out-of-scope, unchanged by this batch of commits.
4. Everything else in FIX-1 through FIX-4 (rate limiting, SSRF/IP normalization, job locks,
   health probes, security headers) is backend/ops-only — no design surface to review.

## Pointers
- `.codecraft-loop-env.md` / `.codecraft-loop-spec.md` (gitignored, local-only) hold the original
  chat-derived spec this doc summarizes — don't treat them as the source of truth going forward,
  this file is.
- `docs/SHARING.md` documents the Share Studio presets (Blueprint/Aurora/Minimal), which
  intentionally use pink more heavily as a card-style choice, not a data-density one.
