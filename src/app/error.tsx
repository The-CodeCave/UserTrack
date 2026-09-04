"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { SENTRY_ENABLED } from "@/lib/sentry";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (SENTRY_ENABLED) void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <main className="bp-grid flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Link href="/" className="mb-8"><Logo /></Link>
      <Panel className="w-full max-w-md p-6 text-center">
        <SectionLabel className="justify-center">Error</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Something broke on our side</h1>
        <p className="mt-1 text-sm text-muted-foreground">The page could not be rendered. Your data is untouched — try again, or head back to the leaderboard.</p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-muted-foreground">ref {error.digest}</p>}
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" render={<Link href="/" />}>Go home</Button>
        </div>
      </Panel>
    </main>
  );
}
