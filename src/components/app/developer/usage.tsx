"use client";

import type { FunctionReturnType } from "convex/server";
import { Check, X } from "lucide-react";
import type { api } from "@convex/_generated/api";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Token } from "./token-list";

export function UsagePanel({ tokens }: { tokens: Token[] }) {
  const active = tokens.filter((t) => t.active);
  if (active.length === 0) return <p className="text-sm text-muted-foreground">No active tokens. Usage appears here once a key or token is used.</p>;
  return (
    <div className="space-y-4">
      {active.map((t) => {
        const pct = Math.min(100, Math.round((t.usage.today / t.usage.perDay) * 100));
        return (
          <div key={t.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{t.name} <span className="font-mono text-[11px] text-muted-foreground">{t.prefix}</span></span>
              <span className="tabular shrink-0 font-mono text-[11px] text-muted-foreground">{t.usage.today} / {t.usage.perDay} today · {t.usage.last7d} in 7d</span>
            </div>
            <div className="mt-1.5 h-1 w-full bg-line"><div className={cn("h-full", pct >= 90 ? "bg-destructive" : "bg-pink")} style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function ActivityPanel({ rows }: { rows: FunctionReturnType<typeof api.tokens.activity> }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet. Actions performed with your keys and tokens show up here.</p>;
  return (
    <div className="divide-y divide-line border border-line">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start gap-3 p-3">
          {r.ok ? <Check className="mt-0.5 size-4 shrink-0 text-pink" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-mono text-[12px]">{r.action.replace(/_/g, " ")}</span>
              {r.project && <span className="text-muted-foreground">{r.project.name} <span className="font-mono text-[11px]">/{r.project.slug}</span></span>}
            </div>
            <div className="break-words font-mono text-[11px] text-muted-foreground">
              {r.token ? `${r.token.name} · ${r.token.prefix}` : "no token"}{r.detail ? ` · ${r.detail}` : ""}
            </div>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeAgo(r.at)}</span>
        </div>
      ))}
    </div>
  );
}
