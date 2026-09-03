import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { FlashToast } from "@/components/site/flash-toast";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <FlashToast />
      <nav aria-label="Browse" className="flex gap-1 overflow-x-auto border-b border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:hidden">
        {[["/leaderboard", "Leaderboard"], ["/trending", "Trending"], ["/discover", "Discover"], ["/categories", "Categories"], ["/compare", "Compare"]].map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 px-2 py-1 hover:text-foreground">{label}</Link>
        ))}
      </nav>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
