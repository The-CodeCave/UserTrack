"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { BOARD_META } from "@/lib/boards";

const SIZES = [
  { key: "", label: "Any size" },
  { key: "0-100", label: "< 100 users" },
  { key: "100-1k", label: "100 – 1K" },
  { key: "1k-10k", label: "1K – 10K" },
  { key: "10k-100k", label: "10K – 100K" },
  { key: "100k+", label: "100K+" },
];

export interface BoardState { board: string; window: "24h" | "7d" | "30d"; category?: string; size?: string; verified: boolean }

export function boardHref(base: string, s: Partial<BoardState>, current: BoardState) {
  const next = { ...current, ...s };
  const p = new URLSearchParams();
  if (next.board !== "most-new" && !base.includes("/trending") && !base.startsWith("/fastest") && !base.startsWith("/new-saas") && !base.startsWith("/most-new")) p.set("board", next.board);
  if (next.window !== (next.board === "trending" ? "7d" : "30d")) p.set("window", next.window);
  if (next.category && !base.startsWith("/categories/")) p.set("category", next.category);
  if (next.size) p.set("size", next.size);
  if (!next.verified) p.set("all", "1");
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

// URL-driven filter bar: boards + windows are links (crawlable), category/size are selects.
export function BoardFilters({ state, base, lockCategory, lockBoard }: { state: BoardState; base: string; lockCategory?: boolean; lockBoard?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (patch: Partial<BoardState>) => {
    const href = boardHref(base, patch, state);
    router.push(href === base && pathname === base && params.size === 0 ? base : href);
  };
  const windows = (["24h", "7d", "30d"] as const).filter((w) => !(state.board === "new-rising" || state.board === "most-users" || state.board === "activation-rate") || w === "7d");
  return (
    <div className="space-y-3">
      {!lockBoard && (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max border border-line">
            {Object.entries(BOARD_META).map(([key, m]) => (
              <Link key={key} href={boardHref(base, { board: key, window: key === "trending" ? "7d" : "30d" }, state)} className={cn("whitespace-nowrap px-3 py-2 font-mono text-[11px] uppercase tracking-wider", state.board === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                {m.short}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {windows.length > 1 && (
          <div className="flex border border-line">
            {windows.map((w) => (
              <Link key={w} href={boardHref(base, { window: w }, state)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", state.window === w ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{w}</Link>
            ))}
          </div>
        )}
        {!lockCategory && (
          <select aria-label="Category" value={state.category ?? ""} onChange={(e) => set({ category: e.target.value || undefined })} className="h-8 border border-line bg-background px-2 font-mono text-[11px] uppercase tracking-wider text-foreground">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        )}
        <select aria-label="Size" value={state.size ?? ""} onChange={(e) => set({ size: e.target.value || undefined })} className="h-8 border border-line bg-background px-2 font-mono text-[11px] uppercase tracking-wider text-foreground">
          {SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div className="flex border border-line">
          <Link href={boardHref(base, { verified: true }, state)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", state.verified ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>Verified</Link>
          <Link href={boardHref(base, { verified: false }, state)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", !state.verified ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>All sources</Link>
        </div>
      </div>
    </div>
  );
}
