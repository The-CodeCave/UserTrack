import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";

export default function NotFound() {
  return (
    <main className="bp-grid flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Link href="/" className="mb-8"><Logo /></Link>
      <Panel className="w-full max-w-md p-6 text-center">
        <SectionLabel className="justify-center">404</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nothing tracked here</h1>
        <p className="mt-1 text-sm text-muted-foreground">The page may be unpublished, renamed, or never existed.</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button render={<Link href="/leaderboard" />}>Leaderboard</Button>
          <Button variant="outline" render={<Link href="/discover" />}>Discover</Button>
        </div>
      </Panel>
    </main>
  );
}
