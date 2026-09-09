"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FlaskConical, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ENV_PROJECT_ID, ENV_SECRET, NATIVE_PACKAGE, NATIVE_SOURCE_LABEL, NATIVE_SOURCES, type NativeSource, PACKAGE_MANAGERS, SOURCE_FILES, envSnippet, installCommands, normalizeSource } from "@convex/lib/nativeSetup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyBlock, SecretReveal, errMsg } from "@/components/app/developer/copy-block";
import { CopyForAgent } from "@/components/site/copy-for-agent";
import { nativeSdkAgentPrompt } from "@/lib/llm-prompts";
import { CapabilityList, TestResultCard, type TestResult } from "./test-result";
import { formatCompact, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Step = "create" | "install" | "verify" | "done";
const STEPS: { key: Step; label: string }[] = [{ key: "create", label: "Create" }, { key: "install", label: "Install" }, { key: "verify", label: "Verify" }, { key: "done", label: "Live" }];
const SOURCE_HINT: Record<NativeSource, string> = {
  "better-auth": "Official plugin — one line in your Better Auth config.",
  prisma: "One route + prismaUsers(prisma.user).",
  drizzle: "One route + drizzleUsers(db, users).",
  convex: "One HTTP action + a count query.",
  authjs: "Auth.js / NextAuth on Prisma or Drizzle.",
  custom: "Any app: one route + your own count().",
};
const metricsUrl = (base: string, source: NativeSource) => `${base}${source === "better-auth" ? "/usertrack/metrics" : "/metrics"}`;
const hostOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/+$/, "");

// Wizard for native SDK sources: pick the adapter, UserTrack generates the credential, the founder installs, deploys, verifies.
export function NativeSetup({ saasId, websiteUrl, existing, initialSource, onConnected }: { saasId: Id<"saas">; websiteUrl: string; existing?: { url?: string; source?: string; secretPrefix?: string; awaiting: boolean } | null; initialSource?: NativeSource; onConnected?: () => void }) {
  const create = useMutation(api.native.createIntegration);
  const verify = useAction(api.integrations.verifyStored);
  const [source, setSource] = useState<NativeSource>(normalizeSource(existing?.source ?? initialSource ?? "better-auth"));
  const [step, setStep] = useState<Step>(existing ? "install" : "create");
  const [base, setBase] = useState(existing?.url ?? "");
  const [override, setOverride] = useState("");
  const [cred, setCred] = useState<{ projectId: string; secret: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const idx = STEPS.findIndex((s) => s.key === step);
  const files = SOURCE_FILES[source];
  const label = NATIVE_SOURCE_LABEL[source];

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const onCreate = (rotate = false) =>
    run(async () => {
      const c = await create({ saasId, source, rotate });
      setBase(c.url);
      setStep("install");
      if (c.secret) setCred({ projectId: c.projectId, secret: c.secret, url: c.url });
      else toast.message("Integration already exists", { description: "Rotate the secret if your app does not have it." });
    });
  // The base URL is derived, not asked. This is the escape hatch for Convex (own domain) and for a failed auto-discovery.
  const onSaveUrl = () =>
    run(async () => {
      const c = await create({ saasId, url: override.trim(), source });
      setBase(c.url);
      setOverride("");
      setResult(null);
      toast.success(`UserTrack will call ${hostOf(metricsUrl(c.url, source))}`);
    });
  const onVerify = () =>
    run(async () => {
      const r = await verify({ saasId, role: "users" });
      setResult(r);
      if (r.ok) {
        setStep("done");
        toast.success(`Connected — ${formatCompact(r.detected ?? 0)} users detected`);
        onConnected?.();
      } else toast.error(r.error);
    });

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-4 gap-1 font-mono text-[10px] uppercase tracking-wider">
        {STEPS.map((s, i) => (
          <li key={s.key} className={cn("border-t-2 pt-1", i <= idx ? "border-pink text-pink" : "border-line text-muted-foreground")}>{String(i + 1).padStart(2, "0")} {s.label}</li>
        ))}
      </ol>

      {step === "create" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Your app answers signed aggregate requests itself — verified, without sharing database credentials or any user PII. Pick how your app stores users; UserTrack generates a project id and a secret for it now.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="SDK adapter">
            {NATIVE_SOURCES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={source === s} onClick={() => setSource(s)} className={cn("flex min-h-[60px] flex-col items-start gap-0.5 border p-2.5 text-left transition-colors", source === s ? "border-pink bg-pink/5" : "border-line hover:border-line-strong")}>
                <span className="text-sm font-medium">{NATIVE_SOURCE_LABEL[s]}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{SOURCE_HINT[s]}</span>
              </button>
            ))}
          </div>
          <Button className="h-11" disabled={busy} onClick={() => onCreate(false)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Create integration &amp; generate secret</Button>
          <p className="font-mono text-[11px] text-muted-foreground">No URL to fill in{websiteUrl ? ` — UserTrack derives it from ${hostOf(websiteUrl)}` : ""} and finds your app on its own when you verify.</p>
        </div>
      )}

      {step === "install" && (
        <div className="space-y-4">
          {cred ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Your integration secret</div>
              <SecretReveal secret={cred.secret} />
              <p className="font-mono text-[11px] text-muted-foreground">Add both to your local env file and to your hosting provider for every environment. Never commit the secret.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-line p-3 text-sm">
              <span className="text-muted-foreground">{label} · secret {existing?.secretPrefix ? `${existing.secretPrefix}…` : ""} was shown once. Lost it?</span>
              <Button size="sm" variant="outline" className="h-9" disabled={busy} onClick={() => onCreate(true)}><RefreshCw className={cn("size-4", busy && "animate-spin")} /> Rotate secret</Button>
            </div>
          )}
          <CopyForAgent
            surface="native-setup"
            label="Copy full setup for AI agent"
            className="border border-pink/30 bg-pink/5 p-3"
            hint="Install, route file, env vars and deploy — your agent does all four steps."
            prompt={nativeSdkAgentPrompt({
              sourceLabel: label,
              source,
              packageName: NATIVE_PACKAGE[source],
              installCommand: installCommands(source).npm,
              routeTitle: files.route.title,
              routePath: files.route.path,
              routeCode: files.route.code,
              envSnippet: cred ? envSnippet(cred.projectId, cred.secret) : `${ENV_PROJECT_ID}=${saasId}\n${ENV_SECRET}=<the secret shown once at creation>`,
              pushCode: files.push?.code,
              pushPath: files.push?.path,
              verifyUrl: cred?.url ?? base,
              notes: files.notes,
            })}
          />
          {base && (
            <div className="border border-line p-3">
              <div className="text-label text-muted-foreground">UserTrack will call</div>
              <div className="mt-1 font-mono text-[12px] break-all">POST {metricsUrl(base, source)}</div>
              {source === "convex" ? (
                <div className="mt-2.5 space-y-1.5">
                  <Label htmlFor="native-convex-url" className="text-label">Your Convex site URL</Label>
                  <div className="flex gap-2">
                    <Input id="native-convex-url" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="https://your-deployment.convex.site" className="h-10 bg-background font-mono text-sm" autoComplete="off" />
                    <Button variant="outline" className="h-10" disabled={busy || !override.trim()} onClick={onSaveUrl}>Save</Button>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">Convex serves the handler from its own domain, so this is the one URL UserTrack cannot derive from your website.</p>
                </div>
              ) : (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">Mounted somewhere else? Leave it — verify checks the likely origins for you.</p>
              )}
            </div>
          )}
          <div>
            <div className="mb-1 text-label">1 · Install {NATIVE_PACKAGE[source]}</div>
            <Tabs defaultValue="npm">
              <TabsList className="h-8">{PACKAGE_MANAGERS.map((pm) => <TabsTrigger key={pm} value={pm} className="font-mono text-[11px]">{pm}</TabsTrigger>)}</TabsList>
              {PACKAGE_MANAGERS.map((pm) => <TabsContent key={pm} value={pm}><CopyBlock text={installCommands(source)[pm]} /></TabsContent>)}
            </Tabs>
          </div>
          <CopyBlock label={`2 · ${files.route.title} — ${files.route.path}`} text={files.route.code} hint={files.notes[0]} />
          <CopyBlock label="3 · Environment" text={cred ? envSnippet(cred.projectId, cred.secret) : `${ENV_PROJECT_ID}=${saasId}\n${ENV_SECRET}=ut_int_… (shown once at creation)`} hint="Then deploy your app." />
          {files.push && <CopyBlock label={`${files.push.title} — ${files.push.path}`} text={files.push.code} hint="Signups show up on the dashboard between syncs. Fire-and-forget, never blocks a signup." />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11" onClick={() => setStep("verify")}>Deployed — verify now</Button>
            <Button variant="ghost" className="h-11" render={<a href={source === "better-auth" ? "/developers/integrations/better-auth" : `/developers/integrations/native#${source}`} target="_blank" rel="noreferrer" />}>Docs <ExternalLink className="size-4" /></Button>
          </div>
        </div>
      )}

      {(step === "verify" || step === "done") && (
        <div className="space-y-3">
          {result && <TestResultCard r={result} role="users" />}
          {result?.ok && <CapabilityList caps={result.capabilities} />}
          {step === "done" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-pink"><CheckCircle2 className="size-4" /> Verified via {label} — first snapshot recorded, syncing every 4 hours. Activation and conversion attach automatically when your handler reports them.</div>
              {result?.ok && result.discoveredUrl && <p className="font-mono text-[11px] text-muted-foreground">Found your app at {hostOf(result.discoveredUrl)} and saved it — the first guess was a different origin.</p>}
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">UserTrack calls your app once, checks the signature and reads the total user count. Nothing else is stored until this succeeds.</p>
              {result && !result.ok && result.tried && result.tried.length > 0 && (
                <div className="space-y-1.5 border border-line p-3">
                  <Label htmlFor="native-origin" className="text-label">Where does your app run?</Label>
                  <div className="flex gap-2">
                    <Input id="native-origin" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="https://app.example.com" className="h-10 bg-background font-mono text-sm" autoComplete="off" />
                    <Button variant="outline" className="h-10" disabled={busy || !override.trim()} onClick={onSaveUrl}>Save</Button>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">Also tried {result.tried.map(hostOf).join(", ")} — none of them answered.</p>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="h-11" disabled={busy} onClick={onVerify}>{busy ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />} Verify integration</Button>
                <Button variant="ghost" className="h-11" onClick={() => setStep("install")}>Back to install</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Live event info for a connected native source (signups, activations, conversions pushed between syncs).
export function NativeLive({ saasId }: { saasId: Id<"saas"> }) {
  const summary = useQuery(api.native.eventSummary, { saasId });
  if (!summary) return null;
  const s = summary.sinceLastSync;
  const parts = [`${s.created} signup${s.created === 1 ? "" : "s"}`, ...(s.activated ? [`${s.activated} activated`] : []), ...(s.trials ? [`${s.trials} trial${s.trials === 1 ? "" : "s"}`] : []), ...(s.converted ? [`${s.converted} converted`] : []), ...(s.deleted ? [`${s.deleted} deleted`] : [])];
  return (
    <div className="font-mono text-[11px] text-muted-foreground">
      Live events: {parts.join(" · ")} since last sync{summary.lastEventAt ? ` · last ${timeAgo(summary.lastEventAt)}` : ""}
    </div>
  );
}
