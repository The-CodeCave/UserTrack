"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PROVIDERS, type ProviderKind } from "@/lib/providers-ui";
import { cn } from "@/lib/utils";
import { formatCompact, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrustBadge, type Trust } from "@/components/blueprint/trust-badge";

export interface IntegrationView {
  provider: ProviderKind;
  status: "ok" | "error" | "running";
  trust: Trust;
  lastError?: string;
  lastSyncAt?: number;
}

export function ConnectSource({
  saasId,
  current,
  onConnected,
}: {
  saasId: Id<"saas">;
  current?: IntegrationView | null;
  onConnected?: () => void;
}) {
  const connect = useMutation(api.integrations.connect);
  const [kind, setKind] = useState<ProviderKind>(current?.provider ?? "clerk");
  const [saving, setSaving] = useState(false);
  const meta = PROVIDERS.find((p) => p.kind === kind)!;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const config: Record<string, unknown> = {};
    for (const f of meta.fields) {
      const v = String(fd.get(f.name) ?? "").trim();
      config[f.name] = f.type === "number" ? Number(v) : v;
    }
    setSaving(true);
    try {
      await connect({ saasId, provider: kind, config });
      toast.success("Connected — fetching your first snapshot");
      onConnected?.();
    } catch (err) {
      toast.error((err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PROVIDERS.map((p) => (
          <button
            key={p.kind}
            type="button"
            onClick={() => setKind(p.kind)}
            className={cn(
              "flex min-h-[72px] flex-col items-start gap-1 border p-3 text-left transition-colors",
              kind === p.kind ? "border-pink bg-pink/5" : "border-line hover:border-line-strong",
            )}
          >
            <span className="text-sm font-medium">{p.label}</span>
            <span className={cn("font-mono text-[10px] uppercase tracking-wider", p.trust === "verified" ? "text-pink" : "text-muted-foreground")}>
              {p.trust === "verified" ? "Verified" : p.trust === "conditional" ? "Verified on your domain" : "Self-reported"}
            </span>
          </button>
        ))}
      </div>

      <form key={kind} onSubmit={onSubmit} className="space-y-4 border border-line p-4">
        <div>
          <div className="text-sm font-medium">{meta.tagline}</div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.help}</p>
        </div>
        {meta.fields.map((f) => (
          <div key={f.name} className="space-y-1.5">
            <Label htmlFor={f.name} className="text-label">{f.label}</Label>
            <Input id={f.name} name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} required={!f.optional} min={f.type === "number" ? 0 : undefined} className="h-11 bg-background font-mono text-sm" autoComplete="off" />
          </div>
        ))}
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {current ? "Replace source & sync" : "Connect & fetch first snapshot"}
        </Button>
      </form>
    </div>
  );
}

export function SourceStatus({
  saasId,
  integration,
  totalUsers,
  trust,
}: {
  saasId: Id<"saas">;
  integration: IntegrationView;
  totalUsers: number;
  trust: Trust;
}) {
  const syncNow = useMutation(api.integrations.syncNow);
  const [busy, setBusy] = useState(false);
  const meta = PROVIDERS.find((p) => p.kind === integration.provider)!;

  async function sync() {
    setBusy(true);
    try {
      await syncNow({ saasId });
    } catch (err) {
      toast.error((err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  const running = integration.status === "running";
  return (
    <div className="flex flex-col gap-3 border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {running ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : integration.status === "error" ? (
          <AlertTriangle className="size-5 text-destructive" />
        ) : (
          <CheckCircle2 className="size-5 text-pink" />
        )}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {meta.label} <TrustBadge trust={trust} />
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {running ? "Fetching snapshot…" : integration.status === "error" ? integration.lastError : `${formatCompact(totalUsers)} users · synced ${integration.lastSyncAt ? timeAgo(integration.lastSyncAt) : "never"} · next in ≤ 4h`}
          </div>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={sync} disabled={busy || running} className="h-9">
        <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Sync now
      </Button>
    </div>
  );
}
