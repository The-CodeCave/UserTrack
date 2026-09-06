"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ComboOption { slug: string; label: string; group?: string }

// Multi-select behind a dropdown: picked entries stay visible as chips, the catalog only opens on demand. Replaces
// rendering a hundred options inline. `onCustom` turns an unmatched query into a free-text entry.
export function ComboSelect({ label, hint, options, value, onChange, max, placeholder, icon, onCustom, testId }: {
  label: string; hint?: string; options: readonly ComboOption[]; value: string[]; onChange: (next: string[]) => void; max: number;
  placeholder?: string; icon?: (slug: string) => ReactNode; onCustom?: (raw: string) => string | undefined; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState({ term: "", i: 0 });
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const term = q.trim().toLowerCase();
  const full = value.length >= max;
  const bySlug = useMemo(() => new Map(options.map((o) => [o.slug, o])), [options]);

  const matches = useMemo(
    () => options.filter((o) => !term || o.label.toLowerCase().includes(term) || o.slug.includes(term) || o.group?.toLowerCase().includes(term)),
    [options, term],
  );
  const custom = onCustom && term && !options.some((o) => o.slug === term || o.label.toLowerCase() === term) ? onCustom(term) : undefined;
  const rows = useMemo(() => {
    const list: ({ kind: "option"; option: ComboOption } | { kind: "group"; label: string })[] = [];
    let group: string | undefined;
    for (const option of matches) {
      if (option.group && option.group !== group) { group = option.group; list.push({ kind: "group", label: option.group }); }
      list.push({ kind: "option", option });
    }
    return list;
  }, [matches]);
  const pickable = rows.flatMap((r) => (r.kind === "option" ? [r.option.slug] : [])).concat(custom && !value.includes(custom) ? [custom] : []);

  const active = cursor.term === term ? cursor.i : 0;
  const setActive = (next: (i: number) => number) => setCursor({ term, i: next(active) });

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onPointer = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function toggle(slug: string) {
    onChange(value.includes(slug) ? value.filter((v) => v !== slug) : value.length >= max ? value : [...value, slug]);
    setQ("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (pickable.length ? (i + (e.key === "ArrowDown" ? 1 : pickable.length - 1)) % pickable.length : 0));
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); const slug = pickable[active]; if (slug) toggle(slug); return; }
    if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
  }

  return (
    <div className="space-y-2" ref={root} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-label">{label}</Label>
        <span className={cn("font-mono text-[11px] tabular-nums", full ? "text-pink" : "text-muted-foreground")} aria-live="polite">{value.length}/{max}</span>
      </div>
      {hint && <p className="font-mono text-[11px] text-muted-foreground">{hint}</p>}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((slug) => (
            <li key={slug}>
              <button type="button" onClick={() => toggle(slug)} aria-label={`Remove ${bySlug.get(slug)?.label ?? slug}`}
                className="inline-flex items-center gap-1.5 border border-pink bg-pink/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-pink transition-colors hover:bg-pink/20">
                {icon?.(slug)}{bySlug.get(slug)?.label ?? slug}<X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox" disabled={full && !open}
          className="flex h-11 w-full items-center gap-2 border border-input bg-background px-3 text-left text-sm text-muted-foreground transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50">
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate">{full ? `Maximum of ${max} reached` : (placeholder ?? `Search ${label.toLowerCase()}…`)}</span>
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 border border-line-strong bg-popover shadow-lg">
            <div className="border-b border-line p-2">
              <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label}`} className="h-9 w-full bg-background px-2 text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <ul role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto py-1">
              {rows.map((row, i) =>
                row.kind === "group" ? (
                  <li key={`g-${row.label}-${i}`} className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{row.label}</li>
                ) : (
                  <Row key={row.option.slug} option={row.option} icon={icon} selected={value.includes(row.option.slug)}
                    active={pickable[active] === row.option.slug} disabled={full && !value.includes(row.option.slug)} onPick={() => toggle(row.option.slug)} />
                ),
              )}
              {custom && !full && (
                <li>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(custom)}
                    className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", pickable[active] === custom ? "bg-accent" : "hover:bg-accent")}>
                    <span className="size-4 shrink-0" />Add “<span className="font-mono">{custom}</span>” as free text
                  </button>
                </li>
              )}
              {rows.length === 0 && !custom && <li className="px-3 py-6 text-center font-mono text-[11px] text-muted-foreground">No match.</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ option, selected, active, disabled, onPick, icon }: { option: ComboOption; selected: boolean; active: boolean; disabled: boolean; onPick: () => void; icon?: (slug: string) => ReactNode }) {
  return (
    <li>
      <button type="button" role="option" aria-selected={selected} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onPick}
        className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40", active ? "bg-accent" : "hover:bg-accent")}>
        <Check className={cn("size-4 shrink-0", selected ? "text-pink" : "text-transparent")} />
        {icon?.(option.slug)}
        <span className="truncate">{option.label}</span>
      </button>
    </li>
  );
}
