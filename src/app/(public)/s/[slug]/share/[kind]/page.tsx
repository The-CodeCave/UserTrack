import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { TrackedA, TrackOnMount } from "@/components/analytics/analytics";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { ShareButtons } from "@/components/public/share-buttons";
import { ShareButton } from "@/components/share/share-button";
import { Button } from "@/components/ui/button";
import { GRAPH_KINDS, shareCopy } from "@/lib/share";
import { cardImageUrl, cardQuery, unfurlConfig, verificationLine } from "@/lib/share-card";
import { loadShare as load, shareWindow } from "@/lib/og/share-card";
import { saasUrl, shareUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string; kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// The Studio puts its settings in the shared link (?range=7d&style=…), so the unfurl shows exactly the card that was picked.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, kind } = await params;
  const d = await load(slug, kind);
  if (!d) return { title: "Not found", robots: { index: false } };
  const cfg = unfurlConfig(await searchParams);
  const c = shareCopy(d.s, d.kind, d.m, await shareWindow(slug, d, cfg.range));
  const title = `${d.s.name} · ${c.value}`;
  const description = `${c.sub} · ${verificationLine(d.s.trust)}.`;
  const images = [{ url: cardImageUrl(shareUrl(slug, kind), cfg), width: 1200, height: 630, alt: `${d.s.name} share card`, type: "image/png" }];
  return { title, description, alternates: { canonical: shareUrl(slug, kind) }, openGraph: { title, description, url: `${shareUrl(slug, kind)}${cardQuery(cfg)}`, type: "article", images }, twitter: { card: "summary_large_image", title, description, images }, robots: d.s.hideFromSearch ? { index: false, follow: true } : undefined };
}

export default async function SharePage({ params, searchParams }: Props) {
  const { slug, kind } = await params;
  const d = await load(slug, kind);
  if (!d) notFound();
  const cfg = unfurlConfig(await searchParams);
  const c = shareCopy(d.s, d.kind, d.m, await shareWindow(slug, d, cfg.range));
  const url = shareUrl(slug, kind);
  const image = cardImageUrl(url, cfg);
  const target = { page: url, slug, kind, label: `${d.s.name} · ${c.value}`, trust: d.s.trust, graph: GRAPH_KINDS.has(d.kind), text: c.text };
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Link href={saasUrl(slug)} className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> {d.s.name}</Link>
      <SectionLabel className="mt-6">{c.eyebrow}</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{d.s.name} · <span className="text-pink">{c.value}</span></h1>
      <p className="mt-2 text-muted-foreground">{c.sub}</p>
      <Panel className="mt-6 overflow-hidden p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={`${d.s.name} share card`} width={1200} height={630} className="block w-full" />
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ShareButton target={target} variant="button" className="h-9 border-pink/60 text-pink hover:bg-pink/10">Customize in Studio</ShareButton>
        <ShareButtons url={`${url}${cardQuery(cfg)}`}text={c.text} kind={kind} />
        <TrackOnMount event="share_card_viewed" props={{ kind }} />
        <Button size="sm" variant="outline" render={<TrackedA event="share_card_downloaded" props={{ kind, range: cfg.range }} href={image} download={`${slug}-${kind}.png`} />}><Download className="size-4" /> PNG</Button>
        <Button size="sm" variant="outline" render={<TrackedA event="share_card_downloaded" props={{ kind, range: cfg.range }} href={cardImageUrl(url, { ...cfg, size: "square" })} download={`${slug}-${kind}-square.png`} />}><Download className="size-4" /> Square</Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">This link unfurls with the image above on X, LinkedIn, Slack, Discord, iMessage and WhatsApp. Numbers are re-rendered on every share, so the card never goes stale. Open the Studio for Blueprint / Aurora / Minimal styles, a square format, timeframes and toggles. {verificationLine(d.s.trust)}.</p>
    </div>
  );
}
