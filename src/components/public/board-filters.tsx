"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { BOARD_META, PLATFORMS, PRIMARY_BOARDS, SECONDARY_BOARDS, boardWindows, defaultWindow } from "@/lib/boards";

const SIZES = [
  { key: "", label: "Any size" },
  { key: "0-100", label: "< 100 users" },
  { key: "100-1k", label: "100 – 1K" },
  { key: "1k-10k", label: "1K – 10K" },
  { key: "10k-100k", label: "10K – 100K" },
  { key: "100k+", label: "100K+" },
];

export interface BoardState { board: string; window: "24h" | "7d" | "30d"; category?: string; size?: string; platform?: string; stack?: string; verified: boolean }

// Only the leaderboard and category pages switch boards; every other base is a fixed board.
const switchesBoard = (base: string) => base === "/leaderboard" || base.startsWith("/categories/");

export function boardHref(base: string, s: Partial<BoardState>, current: BoardState) {
  const next = { ...current, ...s };
  const p = new URLSearchParams();
  if (next.board !== "most-new" && switchesBoard(base)) p.set("board", next.board);
  if (next.window !== defaultWindow(next.board)) p.set("window", next.window);
  if (next.category && !base.startsWith("/categories/")) p.set("category", next.category);
  if (next.size) p.set("size", next.size);
  if (next.platform && !base.endsWith("-mobile-apps")) p.set("platform", next.platform);
  if (next.stack && !base.startsWith("/stacks/")) p.set("stack", next.stack);
  if (!next.verified) p.set("all", "1");
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

// URL-driven filter bar: boards + windows are links (crawlable), category/size/platform are selects.
export function BoardFilters({ state, base, lockCategory, lockBoard, lockPlatform }: { state: BoardState; base: string; lockCategory?: boolean; lockBoard?: boolean; lockPlatform?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const changed = (patch: Partial<BoardState>) => track("board_filter_change", { board: patch.board ?? state.board, window: patch.window ?? state.window, category: (patch.category ?? state.category) || "" });
  const set = (patch: Partial<BoardState>) => {
    changed(patch);
    const href = boardHref(base, patch, state);
    router.push(href === base && pathname === base && params.size === 0 ? base : href);
  };
  const windows = boardWindows(state.board);
  const select = "h-8 border border-line bg-background px-2 font-mono text-[11px] uppercase tracking-wider text-foreground";
  const boardLink = (key: string) => (
    <Link key={key} href={boardHref(base, { board: key, window: defaultWindow(key) }, state)} onClick={() => changed({ board: key, window: defaultWindow(key) })} className={cn("whitespace-nowrap px-3 py-2 font-mono text-[11px] uppercase tracking-wider", state.board === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
      {BOARD_META[key].short}
    </Link>
  );
  return (
    <div className="space-y-3">
      {!lockBoard && (
        <div className="-mx-4 space-y-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max border border-line">{PRIMARY_BOARDS.map(boardLink)}</div>
          <div className="flex w-max items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">More rankings</span>
            <div className="flex border border-line">{SECONDARY_BOARDS.map(boardLink)}</div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {windows.length > 1 && (
          <div className="flex border border-line">
            {windows.map((w) => (
              <Link key={w} href={boardHref(base, { window: w }, state)} onClick={() => changed({ window: w })} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", state.window === w ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{w}</Link>
            ))}
          </div>
        )}
        {!lockCategory && (
          <select aria-label="Category" value={state.category ?? ""} onChange={(e) => set({ category: e.target.value || undefined })} className={select}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        )}
        <select aria-label="Size" value={state.size ?? ""} onChange={(e) => set({ size: e.target.value || undefined })} className={select}>
          {SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {!lockPlatform && (
          <select aria-label="Platform" value={state.platform ?? ""} onChange={(e) => set({ platform: e.target.value || undefined })} className={select}>
            {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        )}
        <div className="flex border border-line">
          <Link href={boardHref(base, { verified: true }, state)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", state.verified ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>Verified</Link>
          <Link href={boardHref(base, { verified: false }, state)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", !state.verified ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>All sources</Link>
        </div>
      </div>
    </div>
  );
}
