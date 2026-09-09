"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowRight, Loader2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { SiteImport } from "@convex/enrich";
import { track } from "@/lib/analytics";
import type { PreviewDraft } from "@/lib/preview-draft";
import { urlError } from "@/components/public/preview-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const draftOf = (s: SiteImport): PreviewDraft => ({
  url: s.url, ready: true, name: s.name, description: s.description, valueProposition: s.valueProposition,
  logoUrl: s.logoUrl, logoStorageId: s.logoStorageId, category: s.hints.category, projectType: s.hints.projectType,
  appStoreUrl: s.hints.appStoreUrl, playStoreUrl: s.hints.playStoreUrl,
  identity: s.hints.identity, analytics: s.hints.analytics, monetization: s.hints.monetization,
});

const filledBy = (d: PreviewDraft) => (["name", "description", "valueProposition", "logoUrl", "category"] as const).filter((k) => d[k]);

// Step one of adding a product: the live URL, nothing else. It is read once here so the form on the next screen
// arrives filled in — name, description, tagline, icon, category and, if the page links to a store, the platform.
// A page we cannot read is not a dead end: the address still carries over and the founder types the rest.
export function SiteStep({ onDone, after }: { onDone: (draft: PreviewDraft | null) => void; after?: ReactNode }) {
  const read = useAction(api.enrich.site);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = urlError(url);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const draft = draftOf(await read({ url: url.trim() }));
      track("site_autofill", { fields: filledBy(draft).join(","), auto: true });
      onDone(draft);
    } catch (err) {
      setError(err instanceof ConvexError ? ((err.data as { message?: string }).message ?? "Could not read that website") : "Could not read that website");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="url"
          inputMode="url"
          autoFocus
          aria-label="Your product's website address"
          aria-invalid={error ? true : undefined}
          placeholder="yourdomain.com"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          className="h-12 flex-1 bg-background text-base"
          data-testid="site-step-url"
        />
        <Button type="submit" size="lg" className="h-12 shrink-0 px-6" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Reading your page…" : "Continue"} {busy ? null : <ArrowRight className="size-4" />}
        </Button>
      </div>
      <p className={error ? "text-sm text-destructive" : "font-mono text-[11px] text-muted-foreground"}>
        {error ?? "We read your public homepage once and fill in the name, description, icon and category."}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={() => onDone(url.trim() && !urlError(url) ? { url: url.trim() } : null)} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {error ? "Continue without autofill" : "Skip — I will fill it in myself"}
        </button>
        {after}
      </div>
    </form>
  );
}
