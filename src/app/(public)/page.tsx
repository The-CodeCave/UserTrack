import Link from "next/link";
import { publicQuery, publicData } from "@/lib/convex-public";
import { ArrowRight, Plug, LineChart, Share2, ShieldCheck, Lock, Clock } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { LeaderboardRow } from "@/components/public/saas-card";
import { CardRail } from "@/components/public/card-rail";
import { SearchBox } from "@/components/public/search-box";
import { AddSaasDialog } from "@/components/public/add-saas-dialog";
import { PreviewForm } from "@/components/public/preview-form";
import { DegradedNotice } from "@/components/site/degraded";
import { formatCompact } from "@/lib/format";

export const revalidate = 300;

const DISABLED_TABS = ["Trending", "Fastest growing", "New & rising", "Biggest movers"];
const HERO_NAV = [["/discover", "Discover"], ["/trending", "Trending"], ["/leaderboard", "Leaderboard"], ["/developers", "Developers"]] as const;

export default async function LandingPage() {
  const data = await publicData(() => publicQuery(api.public.landing, {}));
  // `convex deploy --cmd` builds before it pushes, so this page is prerendered against the *previous* backend — a
  // list this release added does not exist yet at build time and must not be read as if it did.
  const top = data?.top ?? [];
  const trending = data?.trending ?? [];
  const newAndHot = data?.newAndHot ?? [];
  const stats = data?.stats;

  return (
    <div>
      {/* No overflow clip: the search dropdown hangs out of the hero into the rails below it. */}
      <section className="relative">
        <div aria-hidden className="bp-grid bp-grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-12 text-center lg:pb-14 lg:pt-16">
          <SectionLabel className="justify-center">Public SaaS growth leaderboard · free</SectionLabel>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Which SaaS is gaining users <span className="text-pink">right now</span>?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Connect your product in minutes. UserTrack pulls your user count read-only every 4 hours and gives you a public growth page, verified rankings and a chart people actually share.
          </p>
          <div className="mx-auto mt-7 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <SearchBox overlay className="flex-1" placeholder="Search a SaaS or a founder…" />
            <AddSaasDialog />
          </div>
          <nav aria-label="Browse the board" className="mt-5 flex flex-wrap items-center justify-center gap-x-1 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {HERO_NAV.map(([href, label], i) => (
              <span key={href} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden className="text-line-strong">·</span>}
                <Link href={href} className="px-2 py-1 underline-offset-4 transition-colors hover:text-foreground hover:underline">{label}</Link>
              </span>
            ))}
          </nav>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {stats && <span className="border border-line px-2 py-1">{formatCompact(stats.trackedUsers)} users tracked</span>}
            {stats && <span className="border border-line px-2 py-1">{stats.saasCount} SaaS listed</span>}
            <span className="border border-line px-2 py-1">Synced every 4h</span>
          </div>
        </div>
      </section>

      {(trending.length > 0 || newAndHot.length > 0) && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl space-y-7 px-4 py-8">
            <CardRail title="Trending now" href="/trending" items={trending} />
            <CardRail title="New & rising" href="/new-saas" items={newAndHot} />
          </div>
        </section>
      )}

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between">
            <div>
              <SectionLabel>Rankings</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Top 100 by total users</h2>
            </div>
            <Button variant="ghost" render={<Link href="/leaderboard" />}>Full board <ArrowRight className="size-4" /></Button>
          </div>
          <div className="mt-6 flex w-max border border-line">
            <span className="bg-foreground px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-background">Top 100</span>
            {DISABLED_TABS.map((label) => (
              <span key={label} aria-disabled className="cursor-not-allowed px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground/40">{label}</span>
            ))}
          </div>
          <div className="mt-4 space-y-1">
            {!data && <DegradedNotice />}
            {data && top.length === 0 && <Panel className="p-6 text-sm text-muted-foreground">The board is empty — your SaaS could be #1 today.</Panel>}
            {top.map((s, i) => <LeaderboardRow key={s._id} s={s} position={i + 1} board="most-users" window="30d" dense />)}
            {data && top.length > 0 && top.length < 100 && <GhostRow n={top.length + 1} />}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <SectionLabel>How it works</SectionLabel>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Step n="01" Icon={Plug} title="Connect a source" text="Clerk, Supabase, Firebase, Auth0 or your own JSON endpoint. Read-only keys, stored server-side, never shown again. Add PostHog for activation, Plausible / GA4 for traffic, Stripe for revenue." />
            <Step n="02" Icon={LineChart} title="We snapshot every 4h" text="Immutable snapshots build your history. Total, new users, activation, retention, trending score, milestones and benchmarks — computed, never typed." />
            <Step n="03" Icon={Share2} title="Share it" text="A public growth page, milestone cards with custom preview images, an embeddable badge and a public API." />
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionLabel>Trust by construction</SectionLabel>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Growth you can&apos;t type in</h2>
            <p className="mt-3 text-muted-foreground">Rankings only count verified sources. Manual numbers are allowed — but they are labelled self-reported and never ranked. Every snapshot stores where it came from.</p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-pink" /><span><b>Verified</b> — synced from Clerk, Supabase, or an endpoint on your own domain.</span></li>
              <li className="flex gap-3"><Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><b>Self-reported</b> — visible with a badge, excluded from rankings.</span></li>
              <li className="flex gap-3"><Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><b>Pending</b> — connected, waiting for the first successful sync.</span></li>
            </ul>
          </div>
          <Panel className="p-5">
            <div className="text-label">Ranking formula</div>
            <div className="mt-2 font-mono text-sm leading-relaxed">
              rank = <span className="text-pink">new_users_30d</span> desc<br />
              tiebreak: growth_30d_pct, total_users<br />
              where trust = <span className="text-pink">verified</span> and public = true
            </div>
            <div className="mt-4 text-xs text-muted-foreground">Growth beats size. A 2-week-old product with 400 new users outranks a 50k-user product that stalled. Unusual jumps put a product “under review” until the next steady week — never silently ranked.</div>
          </Panel>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Put your growth on the map.</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">Free, no card. Type your address and see the page before you sign up.</p>
          <div className="mt-8"><PreviewForm /></div>
        </div>
      </section>
    </div>
  );
}

function Step({ n, Icon, title, text }: { n: string; Icon: typeof Plug; title: string; text: string }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <Icon className="size-5 text-pink" />
        <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
      </div>
      <div className="mt-4 font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </Panel>
  );
}

// Fills the row after the last real product, per D3: never pad with fake rows, always exactly one.
function GhostRow({ n }: { n: number }) {
  return (
    <Link href="/sign-up" className="group block">
      <Panel className="grid grid-cols-[2rem_1fr] items-center gap-3 px-3 py-2 opacity-40 transition-opacity group-hover:opacity-70">
        <div aria-hidden className="font-mono text-sm text-muted-foreground">{String(n).padStart(2, "0")}</div>
        <div className="truncate text-sm text-muted-foreground">#{n} — this could be your SaaS, list it free</div>
      </Panel>
    </Link>
  );
}
