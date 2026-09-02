"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Plus, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Input } from "@/components/ui/input";
import { SaasLogo } from "@/components/public/saas-card";
import { formatCompact } from "@/lib/format";

export function ComparePicker({ selected, days }: { selected: { slug: string; name: string; logoUrl?: string }[]; days: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const slugs = selected.map((s) => s.slug);
  const suggestions = useQuery(api.public.suggest, open ? { q, exclude: slugs } : "skip");
  const go = (next: string[]) => router.push(next.length ? `/compare?s=${next.join(",")}&days=${days}` : "/compare");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((s) => (
        <span key={s.slug} className="inline-flex h-10 items-center gap-2 border border-line bg-card pl-2 pr-1 text-sm">
          <SaasLogo name={s.name} logoUrl={s.logoUrl} size={22} />{s.name}
          <button onClick={() => go(slugs.filter((x) => x !== s.slug))} className="p-1 text-muted-foreground hover:text-foreground" aria-label={`Remove ${s.name}`}><X className="size-3.5" /></button>
        </span>
      ))}
      {selected.length < 4 && (
        <div className="relative">
          <div className="relative">
            <Plus className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Add a product" className="h-10 w-56 bg-card pl-9" aria-label="Add a product to compare" />
          </div>
          {open && suggestions && suggestions.length > 0 && (
            <div className="absolute left-0 top-11 z-20 w-72 border border-line bg-background shadow-lg">
              {suggestions.map((s) => (
                <button key={s.slug} onMouseDown={() => { go([...slugs, s.slug]); setQ(""); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                  <SaasLogo name={s.name} logoUrl={s.logoUrl} size={22} /><span className="flex-1 truncate">{s.name}</span><span className="font-mono text-[11px] text-muted-foreground">{formatCompact(s.totalUsers)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
