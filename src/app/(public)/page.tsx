import Link from "next/link";
import { publicQuery, publicData } from "@/lib/convex-public";
import { ArrowRight, Plug, LineChart, Share2, ShieldCheck, Lock, Clock } from "lucide-react";
import { api } from "@convex/_generated/api";
import { CtaLink } from "@/components/analytics/analytics";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { DemoChart } from "@/components/public/demo-chart";
import { LeaderboardRow, MiniSaasCard } from "@/components/public/saas-card";
import { DegradedNotice } from "@/components/site/degraded";
import { formatCompact } from "@/lib/format";

export const revalidate = 300;

export default async function LandingPage() {
  const data = await publicData(() => Promise.all([
    publicQuery(api.public.leaderboard, { verifiedOnly: false, limit: 5 }),
    publicQuery(api.public.board, { board: "trending", window: "7d", verifiedOnly: false, limit: 3 }),
    publicQuery(api.public.stats, {}),
  ]));
  const [top, trending, stats] = data ?? [[], [], undefined];

  return (
    <div>
      <section className="relative overflow-hidden">
        <div aria-hidden className="bp-grid bp-grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pb-24 lg:pt-24">
          <div>
            <SectionLabel>Public SaaS growth leaderboard · free</SectionLabel>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Which SaaS is gaining users <span className="text-pink">right now</span>?
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Connect your product in minutes. UserTrack pulls your user count read-only every 4 hours and gives you a public growth page, verified rankings and a chart people actually share.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-6" render={<CtaLink href="/sign-up" location="hero" />}>List your SaaS <ArrowRight className="size-4" /></Button>
              <Button size="lg" variant="outline" className="h-12 px-6" render={<Link href="/leaderboard" />}>See the leaderboard</Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {stats && <span>{formatCompact(stats.trackedUsers)} users tracked</span>}
              {stats && <span>{stats.saasCount} SaaS listed</span>}
              <span>Synced every 4h</span>
            </div>
          </div>
          <Panel className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center border border-line font-mono text-xs">AC</div>
                <div>
                  <div className="text-sm font-medium">Acme Analytics</div>
                  <div className="font-mono text-[10px] text-muted-foreground">example · /s/acme</div>
                </div>
              </div>
              <TrustBadge trust="verified" />
            </div>
            <DemoChart />
          </Panel>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionLabel>How it works</SectionLabel>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Step n="01" Icon={Plug} title="Connect a source" text="Clerk, Supabase, Firebase, Auth0 or your own JSON endpoint. Read-only keys, stored server-side, never shown again. Add PostHog for activation, Plausible / GA4 for traffic, Stripe for revenue." />
            <Step n="02" Icon={LineChart} title="We snapshot every 4h" text="Immutable snapshots build your history. Total, new users, activation, retention, trending score, milestones and benchmarks — computed, never typed." />
            <Step n="03" Icon={Share2} title="Share it" text="A public growth page, milestone cards with custom preview images, an embeddable badge and a public API." />
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center">
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

      {trending.length > 0 && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="flex items-end justify-between">
              <div>
                <SectionLabel>Trending · 7d</SectionLabel>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">Momentum right now</h2>
              </div>
              <Button variant="ghost" render={<Link href="/trending" />}>Trending board <ArrowRight className="size-4" /></Button>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {trending.map((s) => <MiniSaasCard key={s._id} s={s} />)}
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex items-end justify-between">
            <div>
              <SectionLabel>Leaderboard · 30d</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Top movers</h2>
            </div>
            <Button variant="ghost" render={<Link href="/leaderboard" />}>Full board <ArrowRight className="size-4" /></Button>
          </div>
          <div className="mt-6 space-y-2">
            {!data && <DegradedNotice />}
            {data && top.length === 0 && <Panel className="p-6 text-sm text-muted-foreground">The board is empty — your SaaS could be #1 today.</Panel>}
            {top.map((s, i) => <LeaderboardRow key={s._id} s={s} position={i + 1} />)}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Put your growth on the map.</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">Free, no card, three minutes from sign-up to a shareable growth page.</p>
          <Button size="lg" className="mt-8 h-12 px-8" render={<CtaLink href="/sign-up" location="footer" />}>Create your page <ArrowRight className="size-4" /></Button>
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
