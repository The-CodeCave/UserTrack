"use client";

import { useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Download, Loader2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { prefillKeys, type PrefillKey, type TrustmrrImport as ImportResult } from "../../../convex/lib/trustmrr";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type { ImportResult, PrefillKey };

export const PREFILL_LABELS: Record<PrefillKey, string> = {
  name: "Product name", description: "Description", websiteUrl: "Website", logoUrl: "Logo", category: "Category", markets: "Markets", techStack: "Tech stack",
  marketingChannels: "Marketing channels", cofounders: "Cofounders", country: "Country", funding: "Funding", teamSize: "Team size", foundedAt: "Founded",
  valueProposition: "Value proposition", problemSolved: "Problem solved", audience: "Audience", pricingSummary: "Pricing model", additionalInfo: "Additional info", projectType: "Mobile app",
};

function summary(key: PrefillKey, v: unknown) {
  if (key === "foundedAt" && typeof v === "number") return new Date(v).toISOString().slice(0, 7);
  if (key === "cofounders" && Array.isArray(v)) return (v as { name?: string; x?: string }[]).map((c) => c.name ?? (c.x ? `@${c.x}` : "")).filter(Boolean).join(", ");
  if (key === "projectType") return "yes";
  const s = Array.isArray(v) ? v.join(", ") : String(v);
  return s.length > 72 ? `${s.slice(0, 71)}…` : s;
}

// Button + inline URL row + diff-style preview. Nothing is written here: `onApply` hands the prefill to the form.
export function TrustmrrImport({ label, filled, onApply, linkedSlug, onUnlink }: {
  label: ReactNode; filled: () => Set<PrefillKey>; onApply: (result: ImportResult, overwrite: boolean) => void; linkedSlug?: string; onUnlink: () => void;
}) {
  const status = useQuery(api.trustmrr.status);
  const importStartup = useAction(api.trustmrr.importStartup);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ result: ImportResult; filled: Set<PrefillKey> } | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const configured = status?.configured ?? false;

  async function run() {
    if (!input.trim() || busy) return;
    setBusy(true); setError(null); setPreview(null);
    track("trustmrr_import_started");
    try {
      const result = await importStartup({ urlOrSlug: input });
      setPreview({ result, filled: filled() });
      track("trustmrr_import_succeeded", { unmappedCount: result.unmapped.length });
    } catch (e) {
      const data = e instanceof ConvexError ? (e.data as { code?: string; message?: string }) : null;
      setError(data?.message ?? "Import failed; try again");
      track("trustmrr_import_failed", { reason: data?.code ?? "unknown" });
    } finally {
      setBusy(false);
    }
  }
  const close = () => { setOpen(false); setPreview(null); setError(null); setInput(""); };
  const keys = preview ? prefillKeys(preview.result.prefill) : [];
  const willFill = keys.filter((k) => overwrite || !preview!.filled.has(k)).length;

  return (
    <div className="space-y-3" data-testid="trustmrr-import">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label}
        <div className="flex flex-wrap items-center gap-2">
          {status && !configured && <span className="font-mono text-[11px] text-muted-foreground">Not configured</span>}
          <Button type="button" size="sm" variant={open ? "default" : "outline"} disabled={!configured || busy} onClick={() => (open ? close() : setOpen(true))} title={status && !configured ? "The operator has not set a TrustMRR API key on this deployment" : undefined} data-testid="trustmrr-open">
            <Download className="size-3.5" /> Import from TrustMRR
          </Button>
        </div>
      </div>
      {linkedSlug && !open && (
        <p className="font-mono text-[11px] text-muted-foreground">
          Linked to <a href={`https://trustmrr.com/startup/${linkedSlug}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-foreground hover:underline">trustmrr.com/startup/{linkedSlug}</a>
          {" · "}<button type="button" onClick={onUnlink} className="underline-offset-4 hover:text-foreground hover:underline">Unlink</button>
        </p>
      )}
      {open && (
        <div className="space-y-3 border border-line bg-background p-3" data-testid="trustmrr-row">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(); } }} placeholder="trustmrr.com/startup/your-slug or slug" className="h-10 font-mono text-sm" aria-label="TrustMRR URL or slug" autoFocus />
            <div className="flex gap-2">
              <Button type="button" className="h-10 flex-1 sm:flex-none" disabled={busy || !input.trim()} onClick={() => void run()} data-testid="trustmrr-run">
                {busy && <Loader2 className="size-3.5 animate-spin" />} {busy ? "Importing…" : "Import"}
              </Button>
              <Button type="button" variant="ghost" className="h-10" onClick={close} aria-label="Close import"><X className="size-4" /></Button>
            </div>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">Reads the public profile only — never revenue. Up to 5 imports per 10 minutes.</p>
          {error && <p className="text-sm text-pink" role="alert">{error}</p>}
          {preview && (
            <div className="space-y-3 border-t border-line pt-3" data-testid="trustmrr-preview">
              <p className="text-sm">
                <span className="font-medium">These fields will be filled</span> from <a href={preview.result.source.url} target="_blank" rel="noreferrer" className="font-mono underline-offset-4 hover:underline">{preview.result.source.slug}</a>
                <span className="text-muted-foreground"> · {willFill} of {keys.length}</span>
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {keys.map((k) => {
                  const has = preview.filled.has(k);
                  return (
                    <li key={k} className={cn("flex min-w-0 items-baseline gap-2 border border-line px-2 py-1.5 text-xs", has && !overwrite && "opacity-50")}>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{PREFILL_LABELS[k]}</span>
                      <span className="min-w-0 flex-1 truncate">{summary(k, preview.result.prefill[k])}</span>
                      {has && <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-wider", overwrite ? "text-pink" : "text-muted-foreground")}>{overwrite ? "overwrites" : "keeps yours"}</span>}
                    </li>
                  );
                })}
              </ul>
              {preview.result.unmapped.length > 0 && <p className="font-mono text-[11px] text-muted-foreground">Not matched, skipped: {preview.result.unmapped.join(" · ")}</p>}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="size-4 accent-foreground" data-testid="trustmrr-overwrite" />
                Overwrite existing values
              </label>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => { onApply(preview.result, overwrite); close(); }} data-testid="trustmrr-apply">Apply</Button>
                <Button type="button" size="sm" variant="outline" onClick={close}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
