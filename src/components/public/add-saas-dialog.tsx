"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Plus } from "lucide-react";
import type { SitePreview } from "@convex/enrich";
import { authClient } from "@/lib/auth-client";
import { track } from "@/lib/analytics";
import { writePreviewDraft } from "@/lib/preview-draft";
import { readSitePreview, draftOf } from "@/lib/preview-request";
import { urlError } from "@/components/public/preview-form";
import { stackQuestions } from "@/lib/stack-recommendation";
import { categoryLabel } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { SaasLogo } from "@/components/public/saas-card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const STACK_LABELS = new Map(stackQuestions("hybrid").flatMap((q) => q.options.map((o) => [`${q.key}:${o.value}`, o.label] as const)));

// Step 1 of the existing wizard, on the landing page: the address is read here, the result is stored as the
// same PreviewDraft the wizard reads at mount, so /app/onboarding and /app/saas/new resume at "Is this right?"
// instead of asking for the address again. Nothing is created without an account — the wizard still owns that.
export function AddSaasDialog() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SitePreview | null>(null);

  const next = session ? "/app/saas/new" : "/sign-up?next=/app/onboarding";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = urlError(url);
    if (problem) { setError(problem); track("preview_failed", { reason: "invalid_input" }); return; }
    setBusy(true);
    setError(null);
    track("preview_started");
    const out = await readSitePreview(url.trim());
    setBusy(false);
    if ("error" in out) { setError(out.error); track("preview_failed", { reason: out.reason }); return; }
    setPreview(out.preview);
    writePreviewDraft(draftOf(out.preview));
    track("preview_ready", { detected: (["identity", "analytics", "monetization"] as const).filter((k) => out.preview.hints[k]).join(",") });
  }

  function skip() {
    writePreviewDraft({ url: url.trim() });
    setPreview({ url: url.trim(), hints: {}, claimed: null });
  }

  function reset() {
    setPreview(null);
    setError(null);
    setUrl("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button size="lg" className="h-12 shrink-0 px-5" />}>
        <Plus className="size-4" /> Add your SaaS
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-none border border-line-strong bg-background p-0 sm:max-w-lg">
        <div className="border-b border-line p-5">
          <DialogHeader>
            <SectionLabel>Free · no card</SectionLabel>
            <DialogTitle className="text-xl tracking-tight">Add your SaaS</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {preview ? "This is what your homepage told us. Create your account and the setup wizard picks up right here." : "Start with your address. We read your public homepage once and fill in the name, description, icon and category."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5">
          {!preview ? (
            <form onSubmit={submit} noValidate className="space-y-3">
              <Input
                name="url"
                inputMode="url"
                autoFocus
                aria-label="Your product's website address"
                aria-invalid={error ? true : undefined}
                placeholder="yourdomain.com"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                className="h-12 bg-card text-base"
              />
              <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
                {busy ? <><Loader2 className="size-4 animate-spin" /> Reading your page…</> : <>Continue <ArrowRight className="size-4" /></>}
              </Button>
              <p className={error ? "text-sm text-destructive" : "font-mono text-[11px] text-muted-foreground"}>
                {error ?? "Nothing is saved yet. UserTrack never lets anyone type their user count in — it is read from a source you connect."}
              </p>
              <button type="button" disabled={Boolean(urlError(url))} onClick={skip} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40">
                {error ? "Continue without autofill" : "Skip — I will fill it in myself"}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {preview.claimed && (
                <Panel className="border-pink/40 bg-pink/5 p-4">
                  <div className="text-label text-pink">Already on the board</div>
                  <p className="mt-2 text-sm">{preview.claimed.name} is already tracked. If this is your product, sign in with the account that listed it.</p>
                  <Button variant="outline" size="sm" className="mt-3" render={<Link href={`/s/${preview.claimed.slug}`} />}>See the live page <ExternalLink className="size-4" /></Button>
                </Panel>
              )}
              <Panel className="p-4">
                <div className="flex items-start gap-3">
                  <SaasLogo name={preview.name ?? preview.url} logoUrl={preview.logoUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{preview.name ?? "Your product"}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">{preview.url}</div>
                    {preview.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{preview.description}</p>}
                  </div>
                </div>
              </Panel>
              <Detected hints={preview.hints} />
              <Button size="lg" className="h-12 w-full" onClick={() => track("preview_signup_click")} render={<Link href={next} />}>
                {session ? "Continue setup" : "Create free account & continue"} <ArrowRight className="size-4" />
              </Button>
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={reset} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Use a different address</button>
                <Link href="/preview" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">See the full preview →</Link>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detected({ hints }: { hints: SitePreview["hints"] }) {
  const lines = [
    hints.identity && <>Sign-in runs on <b>{STACK_LABELS.get(`identity:${hints.identity}`)}</b> — that is where your user count comes from.</>,
    hints.analytics && <><b>{STACK_LABELS.get(`analytics:${hints.analytics}`)}</b> is on your site — it can tell us who activates.</>,
    hints.monetization && <><b>{STACK_LABELS.get(`monetization:${hints.monetization}`)}</b> is on your site — converted users only, never amounts.</>,
    hints.projectType === "hybrid" && <>App Store / Google Play links found — web and mobile tracked as one product.</>,
    hints.category && <>Reads like <b>{categoryLabel(hints.category)}</b> — change it any time.</>,
  ].filter(Boolean);
  return (
    <Panel className="p-4">
      <div className="text-label">What we already know</div>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing was visible on your homepage — many apps load their providers behind a proxy. You pick your source in one step after signing up.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-pink" /><span>{line}</span></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
