import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { ArrowLeft, Download } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { ShareButtons } from "@/components/public/share-buttons";
import { Button } from "@/components/ui/button";
import { parseShareKind, shareCopy } from "@/lib/share";
import { saasUrl, shareUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

async function load(slug: string, kindRaw: string) {
  const parsed = parseShareKind(kindRaw);
  if (!parsed) return null;
  if (parsed.milestoneId) {
    const r = await fetchQuery(api.public.milestone, { slug, id: parsed.milestoneId });
    if (!r) return null;
    return { s: r.saas, m: r.milestone, kind: parsed.kind };
  }
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (!s) return null;
  return { s, m: null, kind: parsed.kind };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; kind: string }> }): Promise<Metadata> {
  const { slug, kind } = await params;
  const d = await load(slug, kind);
  if (!d) return { title: "Not found" };
  const c = shareCopy(d.s, d.kind, d.m);
  const title = `${d.s.name} · ${c.value}`;
  return { title, description: c.sub, alternates: { canonical: shareUrl(slug, kind) }, openGraph: { title, description: c.sub, url: shareUrl(slug, kind) }, twitter: { title, description: c.sub } };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  const d = await load(slug, kind);
  if (!d) notFound();
  const c = shareCopy(d.s, d.kind, d.m);
  const url = shareUrl(slug, kind);
  const image = `${url}/card`;
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
        <ShareButtons url={url} text={c.text} />
        <Button size="sm" variant="outline" render={<a href={image} download={`${slug}-${kind}.png`} />}><Download className="size-4" /> Download PNG</Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">This link unfurls with the image above on X, LinkedIn, Slack, Discord, iMessage and WhatsApp. Numbers are re-rendered on every share, so the card never goes stale.</p>
    </div>
  );
}
