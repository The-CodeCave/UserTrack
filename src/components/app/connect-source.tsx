"use client";

import { useState, type FormEvent } from "react";
import { useAction, useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Unplug, ChevronDown, FlaskConical } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PROVIDERS, providersForRole, ROLE_META, type ProviderKind, type Role } from "@/lib/providers-ui";
import { cn } from "@/lib/utils";
import { formatCompact, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TrustBadge, type Trust } from "@/components/blueprint/trust-badge";
import { Snippet } from "@/components/public/embed-badge";
import { PostgresWizard } from "./postgres-wizard";
import { BetterAuthLive, BetterAuthSetup } from "./better-auth-setup";
import { CapabilityList, TestResultCard, type TestResult } from "./test-result";

export interface IntegrationView {
  role: Role;
  provider: ProviderKind;
  status: "ok" | "error" | "running";
  trust: Trust;
  lastError?: string;
  lastSyncAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  consecutiveFailures?: number;
  publicConfig?: Record<string, string>;
  awaitingVerification?: boolean;
  pluginVersion?: string;
  verification?: "verified" | "partially_verified" | "self_reported";
  capabilities?: { createdUsers: boolean; historicalUsers: boolean; retention: boolean };
}

const VERIFICATION_LABEL = { verified: "Verified", partially_verified: "Partially verified", self_reported: "Self-reported" } as const;

const errMsg = (err: unknown) => (err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0];

export function ConnectSource({ saasId, role = "users", current, onConnected, platform, recommended, websiteUrl }: { saasId: Id<"saas">; role?: Role; current?: IntegrationView | null; onConnected?: () => void; platform?: "web" | "mobile"; recommended?: ProviderKind; websiteUrl?: string }) {
  const connect = useMutation(api.integrations.connect);
  const testSource = useAction(api.integrations.test);
  const list = providersForRole(role, platform);
  const [kind, setKind] = useState<ProviderKind>([current?.provider, recommended].find((k) => k && list.some((p) => p.kind === k)) ?? list[0].kind);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [showSteps, setShowSteps] = useState(true);
  const [supabaseMode, setSupabaseMode] = useState<"database" | "api">("database");
  const meta = PROVIDERS.find((p) => p.kind === kind)!;
  const fields = meta.fields.filter((f) => (!f.roles || f.roles.includes(role)) && !(kind === "supabase" && (f.name === "connectionString" || f.name === "sql")));

  function readConfig(form: HTMLFormElement) {
    const fd = new FormData(form);
    const config: Record<string, unknown> = {};
    for (const f of fields) {
      const v = String(fd.get(f.name) ?? "").trim();
      if (!v && f.optional) continue;
      config[f.name] = f.type === "number" ? Number(v) : v;
    }
    return config;
  }

  async function onTest(form: HTMLFormElement) {
    if (!form.reportValidity()) return;
    setTesting(true);
    setResult(null);
    try {
      const r = await testSource({ saasId, role, provider: kind, config: readConfig(form) });
      setResult(r);
      if (!r.ok) toast.error(r.error);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await connect({ saasId, role, provider: kind, config: readConfig(e.currentTarget) });
      toast.success("Connected — fetching the first snapshot");
      onConnected?.();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const wizard = kind === "postgres" || (kind === "supabase" && supabaseMode === "database") || kind === "better_auth";

  return (
    <div className="space-y-5">
      <div className={cn("grid gap-2", list.length > 4 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-4")}>
        {list.map((p) => (
          <button key={p.kind} type="button" onClick={() => setKind(p.kind)} className={cn("flex min-h-[64px] flex-col items-start gap-1 border p-3 text-left transition-colors", kind === p.kind ? "border-pink bg-pink/5" : "border-line hover:border-line-strong")}>
            <span className="flex w-full items-center justify-between gap-1 text-sm font-medium">{p.label}{p.kind === recommended ? <span className="border border-pink/60 px-1 font-mono text-[9px] uppercase tracking-wider text-pink">Rec</span> : p.kind === "better_auth" ? <span className="border border-line px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Plugin · 2 min</span> : null}</span>
            <span className={cn("font-mono text-[10px] uppercase tracking-wider", p.trust === "verified" ? "text-pink" : "text-muted-foreground")}>
              {p.trust === "verified" ? "Verified" : p.trust === "conditional" ? "Verified on your domain" : "Self-reported"}
            </span>
          </button>
        ))}
      </div>

      {kind === "supabase" && (
        <div className="flex border border-line">
          {(["database", "api"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setSupabaseMode(m)} className={cn("flex-1 px-3 py-2 text-left", supabaseMode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              <div className="font-mono text-[11px] uppercase tracking-wider">{m === "database" ? "Connection string · recommended" : "Service role key"}</div>
              <div className={cn("text-[11px]", supabaseMode === m ? "opacity-80" : "")}>{m === "database" ? "auth.users signups per day + 30-day history" : "total users only"}</div>
            </button>
          ))}
        </div>
      )}

      {wizard ? (
        <div className="border border-line p-4">
          <div className="mb-4">
            <div className="text-sm font-medium">{meta.tagline}</div>
            <p className="mt-1 text-xs text-muted-foreground"><span className="text-foreground/70">What we read:</span> {meta.reads}</p>
          </div>
          {kind === "better_auth" ? (
            <BetterAuthSetup key="better_auth" saasId={saasId} websiteUrl={websiteUrl ?? ""} existing={current?.provider === "better_auth" ? { url: current.publicConfig?.url, secretPrefix: current.publicConfig?.secret?.replace(/…$/, ""), awaiting: Boolean(current.awaitingVerification) } : null} onConnected={onConnected} />
          ) : (
            <PostgresWizard key={`${kind}-${role}`} saasId={saasId} role={role} provider={kind === "supabase" ? "supabase" : "postgres"} onConnected={onConnected} />
          )}
        </div>
      ) : (
      <form key={`${kind}-${role}`} onSubmit={onSubmit} className="space-y-4 border border-line p-4">
        <div>
          <div className="text-sm font-medium">{meta.tagline}</div>
          <p className="mt-1 text-xs text-muted-foreground"><span className="text-foreground/70">What we read:</span> {meta.reads}</p>
        </div>
        <div className="border border-line bg-background/60">
          <button type="button" onClick={() => setShowSteps((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-label">
            Setup steps <ChevronDown className={cn("size-3 transition-transform", showSteps && "rotate-180")} />
          </button>
          {showSteps && (
            <ol className="space-y-1.5 border-t border-line px-3 py-3 text-xs text-muted-foreground">
              {meta.steps.map((s, i) => <li key={i} className="flex gap-2"><span className="font-mono text-pink">{String(i + 1).padStart(2, "0")}</span><span>{s}</span></li>)}
              {meta.code && <li className="pt-1"><Snippet label={meta.code.label} text={meta.code.text} /></li>}
            </ol>
          )}
        </div>
        {fields.map((f) => (
          <div key={f.name} className="space-y-1.5">
            <Label htmlFor={f.name} className="text-label">{f.label}{f.optional && <span className="normal-case tracking-normal"> (optional)</span>}</Label>
            {f.type === "textarea" ? (
              <Textarea id={f.name} name={f.name} placeholder={f.placeholder} required={!f.optional} rows={5} className="bg-background font-mono text-xs" autoComplete="off" spellCheck={false} />
            ) : f.type === "select" ? (
              <select id={f.name} name={f.name} defaultValue={f.options?.[0]?.value} className="h-11 w-full border border-line bg-background px-3 font-mono text-sm text-foreground">
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <Input id={f.name} name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} required={!f.optional} min={f.type === "number" ? 0 : undefined} className="h-11 bg-background font-mono text-sm" autoComplete="off" />
            )}
            {f.hint && <p className="font-mono text-[11px] text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
        {result && <TestResultCard r={result} role={role} />}
        {result?.ok && <CapabilityList caps={result.capabilities} />}
        <div className="flex flex-col gap-2 sm:flex-row">
          {kind !== "manual" && (
            <Button type="button" variant="outline" className="h-11" disabled={testing || saving} onClick={(e) => onTest((e.currentTarget as HTMLButtonElement).form!)}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />} Test connection
            </Button>
          )}
          <Button type="submit" className="h-11" disabled={saving || testing}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {current ? "Replace source & sync" : "Connect & fetch first snapshot"}
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}

export function SourceStatus({ saasId, integration, totalUsers, trust, trustLabel, onReplace, onDisconnect }: { saasId: Id<"saas">; integration: IntegrationView; totalUsers?: number; trust?: Trust; trustLabel?: string; onReplace?: () => void; onDisconnect?: () => void }) {
  const syncNow = useMutation(api.integrations.syncNow);
  const disconnect = useMutation(api.integrations.disconnect);
  const [busy, setBusy] = useState(false);
  const meta = PROVIDERS.find((p) => p.kind === integration.provider)!;
  const role = integration.role;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const running = integration.status === "running";
  const cfg = Object.entries(integration.publicConfig ?? {}).filter(([k]) => k !== "events").map(([k, v]) => `${k}: ${v}`).join(" · ");
  if (integration.provider === "better_auth" && integration.awaitingVerification) {
    return (
      <div className="space-y-3 border border-line p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-5 text-amber-400" /><span className="text-label">{ROLE_META[role].label}</span> Better Auth <span className="border border-amber-400/60 px-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-400">Waiting for deployment</span>
        </div>
        <BetterAuthSetup saasId={saasId} websiteUrl="" existing={{ url: integration.publicConfig?.url, secretPrefix: integration.publicConfig?.secret?.replace(/…$/, ""), awaiting: true }} onConnected={onReplace ? undefined : undefined} />
        {onReplace && <button type="button" onClick={onReplace} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Use a different source</button>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {running ? <Loader2 className="mt-0.5 size-5 animate-spin text-muted-foreground" /> : integration.status === "error" ? <AlertTriangle className="mt-0.5 size-5 text-destructive" /> : <CheckCircle2 className="mt-0.5 size-5 text-pink" />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="text-label">{ROLE_META[role].label}</span> {meta.label} {role === "users" && trust && <TrustBadge trust={trust} label={trustLabel} />}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {running ? "Fetching snapshot…" : integration.status === "error" ? `${integration.lastError}${integration.consecutiveFailures ? ` · ${integration.consecutiveFailures} in a row` : ""}` : `${role === "users" && totalUsers !== undefined ? `${formatCompact(totalUsers)} users · ` : ""}synced ${integration.lastSuccessAt ? timeAgo(integration.lastSuccessAt) : "never"} · next in ≤ 4h`}
          </div>
          {cfg && <div className="truncate font-mono text-[11px] text-muted-foreground/70">{cfg}{integration.provider === "better_auth" && integration.pluginVersion ? ` · plugin v${integration.pluginVersion}` : ""}</div>}
          {integration.provider === "better_auth" && <BetterAuthLive saasId={saasId} />}
          {integration.capabilities && (
            <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {integration.verification && <span className={cn("border px-1.5", integration.verification === "verified" ? "border-pink/60 text-pink" : "border-line")}>{VERIFICATION_LABEL[integration.verification]}</span>}
              {role === "users" && <span className="border border-line px-1.5">{integration.capabilities.createdUsers ? "signups read from source" : "signups from snapshot deltas"}</span>}
              {integration.capabilities.historicalUsers && <span className="border border-line px-1.5">history backfill</span>}
              {integration.capabilities.retention && <span className="border border-line px-1.5">active users</span>}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => run(() => syncNow({ saasId, role }))} disabled={busy || running} className="h-9"><RefreshCw className={cn("size-4", busy && "animate-spin")} /> Sync now</Button>
        {onReplace && <Button variant="ghost" size="sm" className="h-9" onClick={onReplace}>Replace</Button>}
        {role !== "users" && <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => run(async () => { await disconnect({ saasId, role }); onDisconnect?.(); })} disabled={busy} aria-label="Disconnect"><Unplug className="size-4" /></Button>}
      </div>
    </div>
  );
}
