import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { LEGAL_PAGES, OPERATOR } from "@/lib/legal";

const BROWSE = [
  ["/leaderboard", "Leaderboard"], ["/trending", "Trending"], ["/hidden-gems", "Hidden gems"], ["/biggest-movers", "Movers"], ["/rankings", "Rankings"],
  ["/categories", "Categories"], ["/compare", "Compare"], ["/sign-up", "List your SaaS"],
] as const;
const DEVELOPERS = [
  ["/developers", "Developers"], ["/developers#api", "API"], ["/developers#mcp", "MCP"], ["/developers/webhooks", "Webhooks"],
  ["https://github.com/The-CodeCave/UserTrack/tree/main/packages", "GitHub packages"],
] as const;
const linkClass = "hover:text-foreground";

function Links({ items }: { items: readonly (readonly [string, string])[] }) {
  return items.map(([href, label]) => (
    href.startsWith("http")
      ? <a key={href} href={href} className={linkClass} target="_blank" rel="noopener noreferrer">{label}</a>
      : <Link key={href} href={href} className={linkClass}>{label}</Link>
  ));
}

// Works in server and client trees (no hooks). `compact` is the one-row variant for the auth and app layouts.
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const legal = LEGAL_PAGES.map((p) => [p.href, p.label] as const);
  if (compact) {
    return (
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <div className="flex flex-wrap gap-4"><Links items={legal} /><Links items={DEVELOPERS.slice(0, 3)} /></div>
          <div className="normal-case tracking-normal">© {new Date().getFullYear()} {OPERATOR.name}</div>
        </div>
      </footer>
    );
  }
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Logo compact />
          <div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-wider"><Links items={BROWSE} /></div>
          <div className="font-mono text-[11px]">Free · verified growth · synced every 4h</div>
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-wider"><Links items={DEVELOPERS} /></div>
          <div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-wider"><Links items={legal} /></div>
          <div className="font-mono text-[11px]">© {new Date().getFullYear()} {OPERATOR.name}</div>
        </div>
      </div>
    </footer>
  );
}
