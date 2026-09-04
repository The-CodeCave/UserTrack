import Link from "next/link";
import { Search } from "lucide-react";
import { Logo } from "./logo";
import { HeaderAuth } from "./header-auth";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/trending", label: "Trending" },
  { href: "/discover", label: "Discover" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label="UserTrack home"><Logo /></Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {NAV.map((n) => (
            <Button key={n.href} variant="ghost" size="sm" className={n.href === "/discover" ? "" : "hidden sm:inline-flex"} render={<Link href={n.href} />}>
              {n.href === "/discover" ? <><Search className="size-4 sm:hidden" /><span className="hidden sm:inline">{n.label}</span></> : n.label}
            </Button>
          ))}
          <HeaderAuth />
        </nav>
      </div>
    </header>
  );
}
