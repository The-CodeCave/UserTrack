"use client";

import { useEffect } from "react";
import { SENTRY_ENABLED } from "@/lib/sentry";
import "./globals.css";

// Replaces the root layout when it is the layout itself that failed, so it ships its own <html> / <body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (SENTRY_ENABLED) void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en" className="dark h-full antialiased">
      {/* The root layout — and with it the Geist font variables — is exactly what failed here, so this page sets its own stack. */}
      <body className="min-h-full bg-background text-foreground" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <main className="bp-grid flex min-h-screen flex-col items-center justify-center px-4 py-16">
          <div className="w-full max-w-md border border-line bg-card p-6 text-center">
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">UserTrack · Error</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Something broke on our side</h1>
            <p className="mt-1 text-sm text-muted-foreground">UserTrack could not start this page. Try again, or come back in a minute.</p>
            {error.digest && <p className="mt-3 font-mono text-[11px] text-muted-foreground">ref {error.digest}</p>}
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button onClick={reset} className="inline-flex h-9 items-center justify-center border border-line bg-foreground px-4 text-sm font-medium text-background">Try again</button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full document load is the point: the router tree itself failed */}
              <a href="/" className="inline-flex h-9 items-center justify-center border border-line px-4 text-sm font-medium">Go home</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
