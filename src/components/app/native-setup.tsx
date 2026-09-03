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
const defaultUrl = (websiteUrl: string, source: NativeSource) => (websiteUrl ? `${websiteUrl.replace(/\/+$/, "")}${source === "better-auth" ? "/api/auth" : "/api/usertrack"}` : "");

// Wizard for native SDK sources: pick the adapter, UserTrack generates the credential, the founder installs, deploys, verifies.
export function NativeSetup({ saasId, websiteUrl, existing, initialSource, onConnected }: { saasId: Id<"saas">; websiteUrl: string; existing?: { url?: string; source?: string; secretPrefix?: string; awaiting: boolean } | null; initialSource?: NativeSource; onConnected?: () => void }) {
  const create = useMutation(api.native.createIntegration);
  const verify = useAction(api.integrations.verifyStored);
  const [source, setSource] = useState<NativeSource>(normalizeSource(existing?.source ?? initialSource ?? "better-auth"));
  const [step, setStep] = useState<Step>(existing ? "install" : "create");
  const [url, setUrl] = useState(existing?.url ?? defaultUrl(websiteUrl, source));
  const [urlTouched, setUrlTouched] = useState(Boolean(existing?.url));
  const [cred, setCred] = useState<{ projectId: string; secret: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const idx = STEPS.findIndex((s) => s.key === step);
  const files = SOURCE_FILES[source];
  const label = NATIVE_SOURCE_LABEL[source];

  function pickSource(s: NativeSource) {
    setSource(s);
    if (!urlTouched) setUrl(defaultUrl(websiteUrl, s));
  }
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
      const c = await create({ saasId, url, source, rotate });
      if (!c.secret) {
        toast.message("Integration already exists", { description: "Rotate the secret if your app does not have it." });
        setStep("install");
        return;
      }
      setCred({ projectId: c.projectId, secret: c.secret, url: c.url });
      setStep("install");
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
              <button key={s} type="button" role="radio" aria-checked={source === s} onClick={() => pickSource(s)} className={cn("flex min-h-[60px] flex-col items-start gap-0.5 border p-2.5 text-left transition-colors", source === s ? "border-pink bg-pink/5" : "border-line hover:border-line-strong")}>
                <span className="text-sm font-medium">{NATIVE_SOURCE_LABEL[s]}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{SOURCE_HINT[s]}</span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="native-url" className="text-label">{source === "better-auth" ? "Better Auth base URL" : "Base URL"}</Label>
            <Input id="native-url" value={url} onChange={(e) => { setUrl(e.target.value); setUrlTouched(true); }} placeholder={source === "better-auth" ? "https://app.example.com/api/auth" : source === "convex" ? "https://your-deployment.convex.site" : "https://app.example.com/api/usertrack"} className="h-11 bg-background font-mono text-sm" autoComplete="off" />
            <p className="font-mono text-[11px] text-muted-foreground">{source === "better-auth" ? "baseURL + basePath of your Better Auth instance (default /api/auth). UserTrack will call POST …/usertrack/metrics." : source === "convex" ? "Your Convex site URL. UserTrack will call POST …/usertrack/metrics." : "Where you mount the handler. UserTrack will call POST …/metrics."}</p>
          </div>
          <Button className="h-11" disabled={busy} onClick={() => onCreate(false)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Create integration &amp; generate secret</Button>
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
          <div>
            <div className="mb-1 text-label">1 · Install {NATIVE_PACKAGE[source]}</div>
            <Tabs defaultValue="npm">
              <TabsList className="h-8">{PACKAGE_MANAGERS.map((pm) => <TabsTrigger key={pm} value={pm} className="font-mono text-[11px]">{pm}</TabsTrigger>)}</TabsList>
              {PACKAGE_MANAGERS.map((pm) => <TabsContent key={pm} value={pm}><CopyBlock text={installCommands(source)[pm]} /></TabsContent>)}
            </Tabs>
          </div>
          <CopyBlock label={`2 · ${files.route.title} — ${files.route.path}`} text={files.route.code} hint={files.notes[0]} />
          <CopyBlock label="3 · Environment" text={cred ? envSnippet(cred.projectId, cred.secret) : `${ENV_PROJECT_ID}=${saasId}\n${ENV_SECRET}=ut_int_… (shown once at creation)`} hint="Then deploy your app." />
          {files.push && <CopyBlock label={`Optional · ${files.push.title} — ${files.push.path}`} text={files.push.code} hint="Signups show up on the dashboard between syncs. Fire-and-forget, never blocks a signup." />}
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
            <div className="flex items-center gap-2 text-sm text-pink"><CheckCircle2 className="size-4" /> Verified via {label} — first snapshot recorded, syncing every 4 hours. Activation and conversion attach automatically when your handler reports them.</div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">UserTrack calls your app once, checks the signature and reads the total user count. Nothing else is stored until this succeeds.</p>
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
