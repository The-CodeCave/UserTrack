"use client";

import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { formatCompact, formatMoney } from "@/lib/format";
import type { Role } from "@/lib/providers-ui";
import { cn } from "@/lib/utils";

export type TestResult = FunctionReturnType<typeof api.integrations.test>;
type Caps = Extract<TestResult, { ok: true }>["capabilities"];

const VERIFICATION: Record<string, string> = { verified: "Verified", partially_verified: "Partially verified", self_reported: "Self-reported" };

// Shared "what we detected" card for every connect flow. Counts only — never user data.
export function TestResultCard({ r, role }: { r: TestResult; role: Role }) {
  if (!r.ok) {
    return (
      <div className="flex items-start gap-3 border border-destructive/50 bg-destructive/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div><div className="font-medium">Could not read from this source</div><div className="text-xs text-muted-foreground">{r.error}{r.retryable ? " · temporary — try again in a moment" : ""}</div></div>
      </div>
    );
  }
  const m = r.metrics;
  const rows =
    role === "users" ? [["Total users", m.totalUsers], ["New · 24h", m.newUsers24h], ["New · 7d", m.newUsers7d], ["New · 30d", m.newUsers30d], ["Active · 30d", m.activeUsers30d]]
    : role === "activation" ? [["Activated", m.activatedUsers], ["24h", m.activated24h], ["7d", m.activated7d], ["30d", m.activated30d]]
    : role === "traffic" ? [["Visitors · 30d", m.visitors30d], ["Sessions · 30d", m.sessions30d], ["Prev 30d", m.visitorsPrev30d]]
    : [["Paying", m.payingUsers], ["MRR", m.mrr !== undefined ? formatMoney(m.mrr, m.currency) : undefined]];
  const present = rows.filter(([, v]) => v !== undefined);
  return (
    <div className="border border-pink/50 bg-pink/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-4 text-pink" /> Connected in {r.durationMs}ms <span className={cn("ml-auto border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", r.verification === "verified" ? "border-pink text-pink" : "border-line text-muted-foreground")}>{VERIFICATION[r.verification]}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {present.map(([label, v], i) => (
          <div key={String(label)} className="border border-line bg-background/60 p-2">
            <div className="text-label">{label}</div>
            <div className={cn("tabular mt-0.5 text-lg font-semibold", i === 0 && "text-pink")}>{typeof v === "number" ? formatCompact(v) : String(v)}</div>
          </div>
        ))}
      </div>
      {Object.keys(r.publicConfig).length > 0 && <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{Object.entries(r.publicConfig).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>}
    </div>
  );
}

const CAP_LABELS: Record<keyof Caps, string> = { totalUsers: "Total users", createdUsers: "Signups per window", historicalUsers: "30-day history", activationEvents: "Activation", retention: "Retention (estimated)", traffic: "Traffic", revenue: "Revenue" };

export function CapabilityList({ caps }: { caps: Caps }) {
  const entries = (Object.keys(CAP_LABELS) as (keyof Caps)[]).filter((k) => caps[k] || k === "createdUsers" || k === "historicalUsers");
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((k) => (
        <span key={k} className={cn("border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", caps[k] ? "border-line-strong text-foreground" : "border-line text-muted-foreground line-through")}>{CAP_LABELS[k]}</span>
      ))}
      {!caps.createdUsers && <span className="font-mono text-[10px] text-muted-foreground">· windows derived from snapshot deltas</span>}
    </div>
  );
}
