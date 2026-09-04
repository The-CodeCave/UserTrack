import type { ReactNode } from "react";
import { Link } from "./Link";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Built by The CodeCave GmbH · Frechen, Germany</span>
        <nav className="flex gap-5">
          <Link href="/impressum" className="hover:text-foreground">Impressum</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

export function LegalPage({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/brand/monogram.png" alt="" className="size-7" />
            <span className="text-sm font-bold tracking-tight">UserTrack</span>
          </Link>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Back to waitlist</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <div className="text-label">{label}</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <div className="prose-legal mt-4 text-[15px]">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
