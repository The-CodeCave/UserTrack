"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Search, Loader2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasLogo } from "@/components/public/saas-card";
import { track } from "@/lib/analytics";
import { formatCompact, formatDelta } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/utils";

// `overlay` floats the hits above the page instead of pushing it down — the landing hero needs the list to
// appear over the boards, /discover wants it inline. Same query, same rows, only the container differs.
export function SearchBox({ autoFocus, overlay = false, className, placeholder = "Search SaaS, founders, categories, tags…" }: { autoFocus?: boolean; overlay?: boolean; className?: string; placeholder?: string }) {
  const [value, setValue] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 180);
    return () => clearTimeout(t);
  }, [value]);
  const results = useQuery(api.public.search, q.length >= 2 ? { q } : "skip");
  const loading = q.length >= 2 && results === undefined;
  useEffect(() => {
    if (results) track("search", { termLength: q.length, results: results.saas.length + results.profiles.length + results.categories.length });
  }, [results, q]);

  // A floating list must close on click-away and on Escape; the inline one has nothing to close.
  useEffect(() => {
    if (!overlay) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [overlay]);

  const show = q.length >= 2 && Boolean(results) && (!overlay || open);
  const empty = results && results.saas.length === 0 && results.profiles.length === 0 && results.categories.length === 0;

  return (
    <div ref={box} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="h-12 bg-card pl-10 pr-10 text-base"
          aria-label="Search"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {show && results && (
        <div className={overlay ? "absolute inset-x-0 top-full z-40 mt-2 max-h-[24rem] space-y-2 overflow-y-auto border border-line-strong bg-background p-2 text-left shadow-2xl" : "mt-3 space-y-2"}>
          {empty && <Panel className="p-4 text-sm text-muted-foreground">Nothing matches “{q}”.</Panel>}
          {results.categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Categories</span>
              {results.categories.map((c) => (
                <Link key={c.slug} href={`/categories/${c.slug}`} className="inline-flex items-center gap-1.5 border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors hover:border-pink hover:text-pink">{c.label} <span className="text-muted-foreground">{c.count}</span></Link>
              ))}
            </div>
          )}
          {overlay && results.saas.length > 0 && <Group>SaaS</Group>}
          {results.saas.map((s) => (
            <Link key={s._id} href={`/s/${s.slug}`} className="group block">
              <Panel className="flex items-center gap-3 p-3 transition-colors group-hover:border-line-strong">
                <SaasLogo name={s.name} logoUrl={s.logoUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium"><span className="truncate">{s.name}</span><TrustBadge trust={s.trust} label={s.trustLabel} className="hidden sm:inline-flex" /></div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{categoryLabel(s.category)}{s.owner ? ` · @${s.owner.username}` : ""} · {s.description}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCompact(s.totalUsers)}</div>
                  <div className="font-mono text-[11px] text-pink">{formatDelta(s.newUsers30d)} · 30d</div>
                </div>
              </Panel>
            </Link>
          ))}
          {overlay && results.profiles.length > 0 && <Group>Founders</Group>}
          {results.profiles.map((p) => (
            <Link key={p._id} href={`/u/${p.username}`} className="group block">
              <Panel className="flex items-center gap-3 p-3 transition-colors group-hover:border-line-strong">
                <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-background font-mono text-sm">{p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatarUrl} alt="" className="size-full object-cover" />
                ) : p.displayName.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.displayName}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">@{p.username}{p.x ? ` · 𝕏 @${p.x}` : ""}{p.bio ? ` · ${p.bio}` : ""}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCompact(p.totalUsers)}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{p.projectCount} SaaS · <span className="text-pink">{formatDelta(p.newUsers30d)}</span></div>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="px-1 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{children}</div>;
}
