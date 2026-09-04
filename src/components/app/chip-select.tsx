"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ChipOption { slug: string; label: string; group?: string }

// Multi-select as toggle chips with a counter. `searchable` adds a filter box; `onCustom` turns an unmatched query into a free-text entry.
export function ChipSelect({ label, hint, options, value, onChange, max, min, searchable, icon, onCustom }: {
  label: string; hint?: string; options: readonly ChipOption[]; value: string[]; onChange: (next: string[]) => void; max: number; min?: number;
  searchable?: boolean; icon?: (slug: string) => ReactNode; onCustom?: (raw: string) => string | undefined;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const byslug = new Map(options.map((o) => [o.slug, o]));
  const toggle = (slug: string) => onChange(value.includes(slug) ? value.filter((v) => v !== slug) : value.length >= max ? value : [...value, slug]);
  const matches = options.filter((o) => !value.includes(o.slug) && (!term || o.label.toLowerCase().includes(term) || o.slug.includes(term) || o.group?.toLowerCase().includes(term)));
  const custom = onCustom && term && !options.some((o) => o.slug === term || o.label.toLowerCase() === term) ? onCustom(term) : undefined;
  const add = (slug: string) => { toggle(slug); setQ(""); };
  const full = value.length >= max;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-label">{label}</Label>
        <span className={cn("font-mono text-[11px] tabular-nums", full ? "text-pink" : "text-muted-foreground")} aria-live="polite">{value.length}/{max}</span>
      </div>
      {hint && <p className="font-mono text-[11px] text-muted-foreground">{hint}</p>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((slug) => (
            <Chip key={slug} selected onClick={() => toggle(slug)} icon={icon?.(slug)}>{byslug.get(slug)?.label ?? slug}</Chip>
          ))}
        </div>
      )}
      {searchable && (
        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches.length === 1) add(matches[0].slug); else if (custom && !full) add(custom); } }} placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label}`} className="h-9 bg-background" disabled={full} />
      )}
      <div className={cn("flex flex-wrap gap-1.5", searchable && "max-h-48 overflow-y-auto pr-1")}>
        {matches.map((o) => <Chip key={o.slug} onClick={() => add(o.slug)} disabled={full} icon={icon?.(o.slug)}>{o.label}</Chip>)}
        {custom && !full && <Chip onClick={() => add(custom)} dashed>+ Add “{custom}”</Chip>}
        {matches.length === 0 && !custom && <span className="font-mono text-[11px] text-muted-foreground">{full ? `Maximum of ${max} reached.` : "No match."}</span>}
      </div>
      {min !== undefined && value.length < min && <p className="font-mono text-[11px] text-destructive">Pick at least {min}.</p>}
    </div>
  );
}

function Chip({ children, selected, disabled, dashed, onClick, icon }: { children: ReactNode; selected?: boolean; disabled?: boolean; dashed?: boolean; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected === true}
      className={cn("inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        selected ? "border-pink bg-pink/10 text-pink" : "border-line text-muted-foreground hover:border-line-strong hover:text-foreground", dashed && "border-dashed")}>
      {icon}{children}{selected && <span aria-hidden>×</span>}
    </button>
  );
}
