"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { SitePreview } from "@convex/enrich";
import { track } from "@/lib/analytics";
import { categoryLabel } from "@/lib/categories";
import { readPreviewDraft, writePreviewDraft, type PreviewDraft } from "@/lib/preview-draft";
import { recommendStack, stackQuestions } from "@/lib/stack-recommendation";
import { providerLabel } from "@/lib/providers-ui";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaderboardRow, SaasLogo } from "@/components/public/saas-card";
import { PreviewForm } from "@/components/public/preview-form";

// The answers the wizard will show, so the preview names a provider exactly the way step 4 does.
const STACK_LABELS = new Map(stackQuestions("hybrid").flatMap((q) => q.options.map((o) => [`${q.key}:${o.value}`, o.label] as const)));
const SIGN_UP = "/sign-up?next=/app/onboarding";

const draftOf = (p: SitePreview): PreviewDraft => ({
  url: p.url, ready: true, name: p.name, description: p.description, valueProposition: p.valueProposition, logoUrl: p.logoUrl,
  category: p.hints.category, projectType: p.hints.projectType, appStoreUrl: p.hints.appStoreUrl, playStoreUrl: p.hints.playStoreUrl,
  identity: p.hints.identity, analytics: p.hints.analytics, monetization: p.hints.monetization,
});

const previewOf = (d: PreviewDraft): SitePreview => ({
  url: d.url, name: d.name, description: d.description, valueProposition: d.valueProposition, logoUrl: d.logoUrl,
  hints: { category: d.category, projectType: d.projectType, appStoreUrl: d.appStoreUrl, playStoreUrl: d.playStoreUrl, identity: d.identity, analytics: d.analytics, monetization: d.monetization },
  claimed: null,
});

type Outcome = { preview: SitePreview } | { error: string; reason: string };

export function PreviewResult() {
  const [draft] = useState(readPreviewDraft);
  const [preview, setPreview] = useState<SitePreview | null>(() => (draft?.ready ? previewOf(draft) : null));
  const [busy, setBusy] = useState(() => Boolean(draft && !draft.ready));
  const [error, setError] = useState<string | null>(null);

  // One request, no state of its own, so the outcome can be applied from a callback either way.
  const load = useCallback(async (url: string): Promise<Outcome> => {
    try {
      const res = await fetch("/api/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const body = (await res.json().catch(() => null)) as (SitePreview & { message?: string; code?: string }) | null;
      if (!res.ok || !body) return { error: body?.message ?? "Could not read that website", reason: body?.code ?? String(res.status) };
      return { preview: body };
    } catch {
      return { error: "Could not reach UserTrack — check your connection and try again.", reason: "network" };
    }
  }, []);

  const apply = useCallback((out: Outcome) => {
    setBusy(false);
    if ("error" in out) {
      setError(out.error);
      track("preview_failed", { reason: out.reason });
      return;
    }
    setPreview(out.preview);
    writePreviewDraft(draftOf(out.preview));
    track("preview_ready", { detected: (["identity", "analytics", "monetization"] as const).filter((k) => out.preview.hints[k]).join(",") });
  }, []);

  // The hero stores only the address it was given; /preview is where that address is actually read.
  useEffect(() => {
    if (draft && !draft.ready) void load(draft.url).then(apply);
  }, [draft, load, apply]);

  const start = (url: string) => {
    setBusy(true);
    setError(null);
    void load(url).then(apply);
  };

  if (busy) return <Loading />;

  if (!preview) {
    return (
      <div className="text-center">
        <SectionLabel className="justify-center">Preview · no account needed</SectionLabel>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">See your growth page first</h1>
        <p className="mx-auto mb-8 mt-3 max-w-md text-muted-foreground">{error ?? "Type your website address. We read your public homepage and show you the page you would get."}</p>
        {error && <p className="mb-4 font-mono text-[11px] uppercase tracking-wider text-destructive">Nothing was saved — try another address</p>}
        <PreviewForm autoFocus onRun={start} busy={busy} />
      </div>
    );
  }

  return <Result preview={preview} onRun={start} />;
}

function Loading() {
  return (
    <div>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-4 h-10 w-3/4" />
      <Skeleton className="mt-8 h-56 w-full" />
      <Skeleton className="mt-3 h-40 w-full" />
    </div>
  );
}

function Result({ preview, onRun }: { preview: SitePreview; onRun: (url: string) => void }) {
  const { hints } = preview;
  const category = hints.category;
  const stats = useQuery(api.public.stats, {});
  const peers = useQuery(api.public.board, { board: "most-new", window: "30d", verifiedOnly: true, category, limit: 5 });
  const rec = recommendStack({ platform: hints.projectType ?? "web", identity: hints.identity, analytics: hints.analytics, monetization: hints.monetization });
  const detected = (["identity", "analytics", "monetization"] as const).filter((k) => hints[k]);
  const verifiedInScope = category ? stats?.categories.find((c) => c.slug === category)?.count : stats?.verifiedCount;

  return (
    <div>
      <SectionLabel>Preview · nothing saved yet</SectionLabel>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{preview.name ?? "Your product"} on UserTrack</h1>
      <p className="mt-3 text-muted-foreground">Read from your homepage just now. Create an account to claim it — everything below stays editable.</p>

      {preview.claimed && (
        <Panel className="mt-6 border-pink/40 bg-pink/5 p-4">
          <div className="text-label text-pink">Already on the board</div>
          <p className="mt-2 text-sm">{preview.claimed.name} is already tracked on UserTrack. If this is your product, sign in with the account that listed it.</p>
          <Button variant="outline" size="sm" className="mt-3" render={<Link href={`/s/${preview.claimed.slug}`} />}>See the live page <ExternalLink className="size-4" /></Button>
        </Panel>
      )}

      <Panel className="mt-6 p-5">
        <div className="flex items-start gap-4">
          <SaasLogo name={preview.name ?? preview.url} logoUrl={preview.logoUrl} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="truncate text-lg font-semibold">{preview.name ?? "Your product"}</div>
              <TrustBadge trust="pending" />
            </div>
            {preview.valueProposition && <div className="mt-1 text-sm">{preview.valueProposition}</div>}
            {preview.description && <p className="mt-2 text-sm text-muted-foreground">{preview.description}</p>}
            <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{preview.url}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          {[["Total users", "—"], ["New · 7d", "—"], ["Activation", "—"]].map(([label, value]) => (
            <div key={label}>
              <div className="text-label">{label}</div>
              <div className="tabular text-2xl font-semibold text-muted-foreground/50">{value}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Empty on purpose. UserTrack has no numbers for you until you connect a read-only source — and it never lets anyone type them in. That is the whole point of the board.</p>
      </Panel>

      <Panel className="mt-3 p-5">
        <div className="text-label">What your homepage already told us</div>
        {detected.length === 0 && !hints.projectType ? (
          <p className="mt-2 text-sm text-muted-foreground">No providers were visible on your homepage — many apps load them behind a proxy. You will pick yours in one step after signing up.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {hints.identity && <Line>Sign-in runs on <b>{STACK_LABELS.get(`identity:${hints.identity}`)}</b> — we read your user count from it, read-only, every 4 hours.</Line>}
            {hints.analytics && <Line><b>{STACK_LABELS.get(`analytics:${hints.analytics}`)}</b> is on your site — it can tell us how many users actually activate.</Line>}
            {hints.monetization && <Line><b>{STACK_LABELS.get(`monetization:${hints.monetization}`)}</b> is on your site — it gives converted users. Never amounts, never MRR.</Line>}
            {hints.projectType === "hybrid" && <Line>App Store / Google Play links found — we will track your web and mobile users as one product.</Line>}
            {category && <Line>Reads like <b>{categoryLabel(category)}</b> — change it any time.</Line>}
          </ul>
        )}
        {rec.users && <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-pink">Recommended source · {providerLabel(rec.users)}</p>}
      </Panel>

      <Panel className="mt-3 p-5">
        <div className="text-label">Who you would be next to</div>
        <p className="mt-2 text-sm text-muted-foreground">
          {verifiedInScope ? `${verifiedInScope} verified ${category ? `${categoryLabel(category)} ` : ""}product${verifiedInScope === 1 ? "" : "s"} on the board right now.` : "Real, verified products on the board right now."} Every number below came from a connected source.
        </p>
        <div className="mt-4 space-y-1">
          {peers === undefined && <Skeleton className="h-24 w-full" />}
          {peers?.map((s, i) => <LeaderboardRow key={s._id} s={s} position={i + 1} board="most-new" window="30d" dense />)}
          {peers?.length === 0 && <p className="text-sm text-muted-foreground">Nothing verified here yet — you could be first.</p>}
        </div>
      </Panel>

      <div className="mt-8 text-center">
        <Button size="lg" className="h-12 px-8" onClick={() => track("preview_signup_click")} render={<Link href={SIGN_UP} />}>
          Claim this page — free <ArrowRight className="size-4" />
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">
          {detected.length > 0
            ? `${detected.length} onboarding question${detected.length === 1 ? "" : "s"} already answered by your site — we will not ask again.`
            : "Your name, description and logo come with you; everything stays editable."}
        </p>
      </div>

      <div className="mt-10 border-t border-line pt-6">
        <div className="text-label mb-3">Wrong site?</div>
        <PreviewForm onRun={onRun} />
      </div>
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-pink" />
      <span>{children}</span>
    </li>
  );
}
