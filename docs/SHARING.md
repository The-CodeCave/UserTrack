# Sharing: Share Card Studio, share engine, Share Center

**TL;DR** — Every important metric is one click from a designed, deterministic PNG. Share buttons on metric cards, charts, ranks, benchmarks, milestones, the SaaS page and the founder profile open the **Share Card Studio** (live preview, three presets, two formats, timeframe, toggles, custom title, Download / Copy image / Copy link / Post to X). Significant growth events automatically become **share events** listed in the **Share Center** (`/app/share`). Nothing is ever posted without the founder.

## Card URLs

| URL | Renders |
|---|---|
| `/s/<slug>/share/<kind>[?config]` | Share page; `og:image` / `twitter:image` = `/card` with the same config (`size` ignored) |
| `/s/<slug>/share/<kind>/card[?config]` | PNG 1200×630 (or 1080×1080 with `size=square`) |
| `/u/<username>/card[?config]` | Founder card PNG |

`kind`: `users` · `growth` (30d) · `week` (7d) · `rank` · `trending` · `activation` · `conversion` (only when the owner published the rate) · `benchmark` (only when a public top-quarter statement exists) · `milestone-<id>` · `spike-<id>`.

### Configuration (`src/lib/share-card.ts`)

Query parameters, defaults omitted so plain `/card` links stay stable and cacheable:

| Param | Values | Default |
|---|---|---|
| `style` | `blueprint` · `aurora` · `minimal` | blueprint |
| `size` | `og` (1200×630) · `square` (1080×1080) | og |
| `range` | `7d` · `30d` · `90d` · `1y` · `all` (chart window, graph kinds + founder) | 30d |
| `chart`, `logo`, `founder`, `verified`, `dates` | `1` / `0` | all on |
| `title` | ≤60 chars, plain text (control characters stripped, satori escapes text — no markup ever renders) | — |

The renderer (`src/lib/og/share-card.tsx`, `next/og` + vendored Geist) is used for the share page's `og:image` (which points at `/card`), the `/card` PNG and the founder card, so what a founder downloads is exactly what unfurls.

### Presets

- **Blueprint** — house style: graphite, 48 px schematic grid, pink accent, pink top rule.
- **Aurora** — gradient backdrop (pink → violet → blue glows), white chart stroke, multi-colour top rule. Same type, wordmark and footer.
- **Minimal** — flat dark, white number, muted eyebrow, faint pink glow.

### Honesty rules

- The chart uses the same min→max scaling as the site charts, and **prints the scale**: `MAX` / `MIN` values and the first / last date of the window (unless `dates=0`). No cropping, smoothing or truncated axes.
- Footer verification line: `Verified by UserTrack` **only** when `saas.trust === "verified"`; otherwise `Tracked on UserTrack`. Founder cards say "Verified" only when every public project is verified.
- A card only ever contains the public projection of a project (`publicSaas` → visibility applied). Private conversion / activation / traffic metrics cannot appear, and drafts (`isPublic=false`) 404.
- Metric label, value, comparison and date range are always present; the `title` override only replaces the small eyebrow label, never the number.

### Rate limits & caching

Card routes: 40 renders / minute / IP (`take("card:<ip>")`), `Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=86400`. Identical URLs are identical images, so browsers / CDNs dedupe regeneration.

## Share Card Studio (`src/components/share/share-studio.tsx`)

Dialog: preview left (desktop) / top (mobile), controls right / below, sticky action bar. Controls: style tiles, format, timeframe (graph kinds only), Show toggles (chart, logo, founder handle, verification line, date range), title. Actions:

- **Download PNG** — fetches the card, saves `<slug>-<kind>-<style>[-square].png`.
- **Copy image** — `ClipboardItem` when the browser supports it, falls back to download.
- **Copy link** — the share page URL with the Studio config in the query (unfurls with the same image, timeframe included).
- **Post to X** — `x.com/intent/post` with a data-driven draft (`src/lib/x-drafts.ts`) + that same share URL.

The preview cross-fades between configurations; the studio never screenshots the DOM.

Entry points (`ShareButton`): Total users · New users 7d / 30d · growth chart ("Share as card") · rank / trending chip · activation · conversion (public only) · benchmark statement · milestones · founder profile header + aggregate chart · dashboard Sharing section ("Studio" per card, Share Center link).

## Share engine (`convex/share.ts`, rules in `convex/lib/shareRules.ts`)

`shareEvents` — one row per significant achievement, keyed `(saasId, key)` so an event is never created twice:

| Source | Key | Category | Floor |
|---|---|---|---|
| user milestones (`addMilestones`) | milestone key `users:<n>` | userMilestones | ≥ 100 users (activated ≥ 1,000, converted ≥ 100) |
| rank milestones | `top100` · `top10` · `rank:<n>` · `trending_top10` | leaderboardMilestones | milestone rules (Top 100 / Top 10 once, new best rank ≤ 3) |
| records | `best_day:*` (≥100) · `best_week:*` (≥100) · `streak:30/90` | growthRecords | |
| spikes (`sync.ts`) | `spike:<day>` | growthRecords | ≥ 3× baseline (one per day) |
| monthly growth | `monthly_growth:25/50/100` | monthlyGrowth | once per threshold |
| benchmarks (daily `share.benchmarkSweep`) | `bench:<metric>:<YYYY-MM>` | activationBenchmarks | ≥ 90th percentile for `growth30dPct` or `activationRatePct`, category cohort first, **one per metric per month** |

Fields: `kind`, `category`, `title`, `detail`, `metric`, `value`, `rank?`, `percentile?`, `timeframe?`, `milestoneId?` / `eventId?`, `cardKind` (the share kind that renders it), `score` (0–100 priority: #1–#3 > Top 10 > big user counts > records > streaks), `status` (`ready` → `shared` | `dismissed`), timestamps. Demo products never create events. The Share Center lists `ready` first, strongest first; `shared` and `dismissed` tabs keep history; dismissed cards can be restored.

Cooldowns come from the keys themselves (milestones are one-time; spikes are per day and need 3×; benchmarks are per month) plus the auto-post job's own limits (`docs/SOCIAL.md`).

## Share Center (`/app/share`)

Per event: preview, **Preview & download** (opens the Studio with the event bound, so downloading / posting marks it `shared`), **Copy link**, **Post to X**, dismiss / restore. Empty state explains what creates cards.

## Analytics (`shareStats`)

Per UTC day × card kind × action (`generated`, `downloaded`, `copied_link`, `copied_image`, `x_intent`) — counts only, no user, IP or URL. Milestone / spike ids are stripped from the kind.

## Emails

The existing user-milestone and rank-milestone emails now link to the Share Center; no additional email is sent for share events.

## MCP & API

MCP: `usertrack_get_share_events`, `usertrack_create_share_card`, `usertrack_get_x_draft`, `usertrack_get_share_card` (`docs/MCP.md`). Public API exposes cards only through public URLs; drafts and preferences are never returned.
