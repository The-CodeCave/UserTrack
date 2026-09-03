# Follow + watchlists

**TL;DR** — Anyone with an account can follow SaaS products and founders. The watchlist (`/app/following`) is a personalized intelligence feed built only from stored, deduplicated events of what you follow; emails are opt-in and limited to the big moments, with per-kind sub-preferences. Code: `convex/follows.ts`, `convex/email/growth.ts` (`notifyFollowers`), `src/app/app/following/page.tsx`, `src/components/public/follow-button.tsx`, `follow-chip.tsx`.

## Model

`follows { followerId: profiles, targetType: "saas" | "profile", targetId, _creationTime }` with indexes `by_follower`, `by_target`, `by_follower_target`. One row per pair; `followerCount` is denormalized on `saas` and `profiles`.

| Function | Behaviour |
|---|---|
| `follows.follow` | idempotent — second call returns `{ following: true, created: false }`; rejects self-follow, private projects, private profiles, unknown ids; cap 500 follows |
| `follows.unfollow` | idempotent — `{ following: false, removed }` |
| `follows.toggle` | legacy button behaviour (kept) |
| `follows.status` | `{ signedIn, following }` for one target |
| `follows.ids` | `{ signedIn, saas[], profiles[] }` — one subscription that every follow chip on a page shares |
| `follows.feed` | the watchlist (below) |

Public API `GET /api/v1/following` (API key required, returns the key owner's own watchlist) and MCP `usertrack_follow_project` / `usertrack_unfollow_project` / `usertrack_follow_founder` / `usertrack_unfollow_founder` / `usertrack_get_watchlist` (scopes `follows:read` / `follows:write`) use the same helpers (`followTarget`, `unfollowTarget`, `watchlistFeed`). A watchlist is never public.

## UI

- `FollowButton` (public SaaS page, founder page, watchlist) and the compact `FollowChip` on discovery / leaderboard cards. Signed-out visitors are sent to `/sign-in?next=…`.
- `/app/following`: products you track (7-day new users, growth, leaderboard rank with the stored 7-day movement, trending rank, "via founder" when the product comes from a followed founder), founders, and the feed with a 7 / 30 / 90-day selector.

## Personalized feed (`watchlistFeed`)

Watched projects = directly followed public products ∪ public products of followed founders. For each, the feed merges:

| Item kind | Source | Rule |
|---|---|---|
| `milestone` | `milestones` (`by_saas_time`) | any stored milestone in the window |
| `spike`, `activation_spike`, `verified`, `rank_jump`, `traction`, `benchmark` | `events` | stored discovery events (`docs/DISCOVERY.md`) |
| `launched` → `new_project` | `events` | "New from <founder>" when the product is watched via a followed founder |
| `rank_change` | `saas.rank7dAgo → rank` (materialized from `rankHistory`) | shown only for moves of ≥ 5 places |

Stable ids (`milestone:{saasId}:{key}`, `{kind}:{saasId}:{day}`, `rank_change:{saasId}:{from}-{to}`) dedupe the merge; items are sorted by time and capped (`limit` ≤ 200). Private projects never appear, even when directly followed (the follow row is kept, so re-publishing restores the item). Nothing is synthesized from small metric changes.

## Notifications

`notifyFollowers` fans a stored event out to followers of the product and of its founder (never the owner), one email per (event, follower), through the normal email pipeline (`docs/ARCHITECTURE.md` → email). Conservative thresholds (`convex/lib/emailRules.ts`): user milestones from **1,000** users, rank entries into the **Top 10**, spikes **≥ 3×** the baseline.

Preferences (`emailPreferences`, `/app/settings/notifications`, signed-link page):

| Key | Default | Meaning |
|---|---|---|
| `followedSaasUpdates` | off | master switch — nothing is mailed while it is off |
| `followedMilestones` | on | 1K+ user milestones of followed products |
| `followedRanking` | on | Top 10 entries and large 7-day climbs |
| `followedSpikes` | on | ≥ 3× spikes |

The master switch is enforced by `enqueue` (preference gating), the sub-preference by `notifyFollowers` before enqueueing; rows written before v0.9 lack the sub-keys and read as "on". Unsubscribe links (one-click and signed preference page) cover these mails like every other growth email.

Machine consumers use webhooks instead (`docs/WEBHOOKS.md`); the two surfaces share stored events but nothing else.

## Tests

`convex/follows.test.ts`: idempotent follow / unfollow with counters, self-follow and private-target rejection, feed merge (milestones, spikes, launched-as-new-project, rank change, private exclusion, direct vs founder), per-kind email gating.
