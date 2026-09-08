"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { publicUrl } from "@convex/lib/siteMeta";
import { track } from "@/lib/analytics";
import { writePreviewDraft } from "@/lib/preview-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STORE_LINK = /^(https?:\/\/)?(apps\.apple\.com|itunes\.apple\.com|play\.google\.com)\//i;

// Mobile apps are listed too, but the preview reads a website's <head> — so ask for the one they have.
export function urlError(raw: string) {
  const url = raw.trim();
  if (!url) return "Enter your website address";
  if (STORE_LINK.test(url)) return "That is a store listing — enter the website of your app, e.g. yourapp.com";
  if (!publicUrl(url)) return "That does not look like a public website address, e.g. yourdomain.com";
  return null;
}

// The landing CTA: a URL, not a sign-up. The visitor sees their own page first; /preview does the reading.
export function PreviewForm({ busy, onRun, autoFocus }: { busy?: boolean; onRun?: (url: string) => void; autoFocus?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = urlError(url);
    setError(problem);
    if (problem) {
      track("preview_failed", { reason: "invalid_input" });
      return;
    }
    track("preview_started");
    if (onRun) {
      onRun(url.trim());
      return;
    }
    writePreviewDraft({ url: url.trim() });
    router.push("/preview");
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-xl">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="url"
          inputMode="url"
          autoFocus={autoFocus}
          aria-label="Your website address"
          aria-invalid={error ? true : undefined}
          placeholder="yourdomain.com"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          className="h-12 flex-1 bg-background text-base"
        />
        <Button type="submit" size="lg" className="h-12 shrink-0 px-6" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Show my page <ArrowRight className="size-4" />
        </Button>
      </div>
      <p className={error ? "mt-2 text-left text-sm text-destructive sm:text-center" : "mt-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:text-center"}>
        {error ?? "No account needed · we read your public homepage"}
      </p>
    </form>
  );
}
