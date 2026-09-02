"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Search, Loader2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasLogo } from "@/components/public/saas-card";
import { formatCompact, formatDelta } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";

export function SearchBox({ autoFocus, placeholder = "Search SaaS, founders, categories, tags…" }: { autoFocus?: boolean; placeholder?: string }) {
  const [value, setValue] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 180);
    return () => clearTimeout(t);
  }, [value]);
  const results = useQuery(api.public.search, q.length >= 2 ? { q } : "skip");
  const loading = q.length >= 2 && results === undefined;
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className="h-12 bg-card pl-10 pr-10 text-base" aria-label="Search" />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {q.length >= 2 && results && (
        <div className="mt-3 space-y-2">
          {results.saas.length === 0 && results.profiles.length === 0 && <Panel className="p-4 text-sm text-muted-foreground">Nothing matches “{q}”.</Panel>}
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
          {results.profiles.map((p) => (
            <Link key={p._id} href={`/u/${p.username}`} className="group block">
              <Panel className="flex items-center gap-3 p-3 transition-colors group-hover:border-line-strong">
                <div className="grid size-9 place-items-center border border-line bg-background font-mono text-sm">{p.displayName.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.displayName}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">@{p.username}{p.bio ? ` · ${p.bio}` : ""}</div>
                </div>
                <span className="text-label">Founder</span>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
