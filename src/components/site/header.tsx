import Link from "next/link";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { isAuthenticated } from "@/lib/auth-server";

export async function SiteHeader() {
  const authed = await isAuthenticated();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label="UserTrack home"><Logo /></Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" render={<Link href="/leaderboard" />}>Leaderboard</Button>
          {authed ? (
            <Button size="sm" render={<Link href="/app" />}>Dashboard</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" render={<Link href="/sign-in" />}>Sign in</Button>
              <Button size="sm" render={<Link href="/sign-up" />}>Get started</Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
