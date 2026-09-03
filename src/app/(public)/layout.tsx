import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { Logo } from "@/components/site/logo";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <nav aria-label="Browse" className="flex gap-1 overflow-x-auto border-b border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:hidden">
        {[["/leaderboard", "Leaderboard"], ["/trending", "Trending"], ["/discover", "Discover"], ["/categories", "Categories"], ["/compare", "Compare"]].map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 px-2 py-1 hover:text-foreground">{label}</Link>
        ))}
      </nav>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo compact />
          <div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-wider">
            <Link href="/leaderboard" className="hover:text-foreground">Leaderboard</Link>
            <Link href="/trending" className="hover:text-foreground">Trending</Link>
            <Link href="/hidden-gems" className="hover:text-foreground">Hidden gems</Link>
            <Link href="/biggest-movers" className="hover:text-foreground">Movers</Link>
            <Link href="/rankings" className="hover:text-foreground">Rankings</Link>
            <Link href="/categories" className="hover:text-foreground">Categories</Link>
            <Link href="/compare" className="hover:text-foreground">Compare</Link>
            <Link href="/developers" className="hover:text-foreground">API</Link>
            <Link href="/developers/webhooks" className="hover:text-foreground">Webhooks</Link>
            <Link href="/sign-up" className="hover:text-foreground">List your SaaS</Link>
          </div>
          <div className="font-mono text-[11px]">Free · verified growth · synced every 4h</div>
        </div>
      </footer>
    </>
  );
}
