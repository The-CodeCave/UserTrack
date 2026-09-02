import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { LeaderboardRow, type BoardKind, type Window } from "@/components/public/saas-card";
import { BoardFilters, type BoardState } from "@/components/public/board-filters";
import { BOARD_KEYS, BOARD_META } from "@/lib/boards";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const BOARDS = new Set(BOARD_KEYS);
const SIZES = new Set(["0-100", "100-1k", "1k-10k", "10k-100k", "100k+"]);

export type SP = Record<string, string | string[] | undefined>;

export function parseBoard(sp: SP, defaults: Partial<BoardState> & { board: string }): BoardState {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const board = defaults.board === "most-new" && one("board") && BOARDS.has(one("board")!) ? one("board")! : defaults.board;
  const w = one("window");
  const window = (w === "24h" || w === "7d" || w === "30d" ? w : defaults.window ?? (board === "trending" ? "7d" : "30d")) as Window;
  const cat = defaults.category ?? one("category");
  const size = one("size");
  return { board, window, category: cat && CATEGORIES.some((c) => c.slug === cat) ? cat : undefined, size: size && SIZES.has(size) ? size : undefined, verified: one("all") !== "1" };
}

export async function BoardPage({
  state, base, title, intro, lockCategory, lockBoard, eyebrow, children, related,
}: {
  state: BoardState; base: string; title: string; intro: string; lockCategory?: boolean; lockBoard?: boolean; eyebrow?: string; children?: React.ReactNode; related?: { href: string; label: string }[];
}) {
  const [rows, stats] = await Promise.all([
    fetchQuery(api.public.board, { board: state.board as BoardKind, window: state.window, verifiedOnly: state.verified, category: state.category, size: state.size as never, limit: 100 }),
    fetchQuery(api.public.stats, {}),
  ]);
  const meta = BOARD_META[state.board];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel>{eyebrow ?? `${meta.label} · ${state.window}`}</SectionLabel>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{intro}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:w-auto">
          <Stat label="SaaS" value={stats.saasCount} />
          <Stat label="Tracked users" value={stats.trackedUsers} />
          <Stat label="New · 30d" value={stats.newUsers30d} accent />
        </div>
      </div>

      <div className="mt-8"><BoardFilters state={state} base={base} lockCategory={lockCategory} lockBoard={lockBoard} /></div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{meta.blurb}{state.board === "trending" ? " " : ""}{state.board === "trending" && <Link href="/trending#how" className="underline underline-offset-4 hover:text-foreground">How it works</Link>}</p>
        <div className="hidden font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[6rem_7rem_5rem_3.5rem] sm:gap-4">
          <span>Trend</span><span>{meta.short}</span><span>Users</span><span>Move</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {rows.length === 0 && (
          <Panel className="p-8 text-center">
            <div className="text-lg font-medium">Nothing here yet</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.board === "most-activated" || state.board === "activation-rate" ? "No product has connected an activation source with these filters yet." : state.verified ? "No verified SaaS matches these filters. Try “All sources” or another category." : "No SaaS matches these filters yet."}
            </p>
            <Button className="mt-4" render={<Link href="/sign-up" />}>List your SaaS</Button>
          </Panel>
        )}
        {rows.map((s, i) => <LeaderboardRow key={s._id} s={s} position={i + 1} board={state.board as BoardKind} window={state.window} />)}
      </div>

      {children}

      {(related?.length || state.category) && (
        <div className="mt-12 border-t border-line pt-6">
          <SectionLabel>Explore</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {related?.map((r) => <Link key={r.href} href={r.href} className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:border-line-strong hover:text-foreground">{r.label}</Link>)}
            {stats.categories.filter((c) => c.slug !== state.category).map((c) => (
              <Link key={c.slug} href={`/categories/${c.slug}`} className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:border-line-strong hover:text-foreground">{categoryLabel(c.slug)} · {c.count}</Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Panel className="px-3 py-2">
      <div className="text-label">{label}</div>
      <div className={cn("text-xl font-semibold", accent && "text-pink")}>{formatCompact(value)}</div>
    </Panel>
  );
}
