import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { Logo } from "@/components/site/logo";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo compact />
          <div className="flex gap-4 font-mono text-[11px] uppercase tracking-wider">
            <Link href="/leaderboard" className="hover:text-foreground">Leaderboard</Link>
            <Link href="/sign-up" className="hover:text-foreground">List your SaaS</Link>
          </div>
          <div className="font-mono text-[11px]">Free · verified growth · synced every 4h</div>
        </div>
      </footer>
    </>
  );
}
