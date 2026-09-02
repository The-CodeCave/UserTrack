"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FlaskConical, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ENV_PROJECT_ID, ENV_SECRET, INSTALL_COMMANDS, PACKAGE_MANAGERS, PLUGIN_SNIPPET, envSnippet } from "@convex/lib/betterAuthSetup";
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

// Wizard for the native Better Auth plugin: UserTrack generates the credential, the founder installs the plugin, deploys, verifies.
export function BetterAuthSetup({ saasId, websiteUrl, existing, onConnected }: { saasId: Id<"saas">; websiteUrl: string; existing?: { url?: string; secretPrefix?: string; awaiting: boolean } | null; onConnected?: () => void }) {
  const create = useMutation(api.betterAuth.createIntegration);
  const verify = useAction(api.integrations.verifyStored);
  const [step, setStep] = useState<Step>(existing ? "install" : "create");
  const [url, setUrl] = useState(existing?.url ?? (websiteUrl ? `${websiteUrl.replace(/\/+$/, "")}/api/auth` : ""));
  const [cred, setCred] = useState<{ projectId: string; secret: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const idx = STEPS.findIndex((s) => s.key === step);

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
      const c = await create({ saasId, url, rotate });
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
          <p className="text-sm text-muted-foreground">Install the official UserTrack plugin for Better Auth. It exposes aggregate user growth metrics without sending emails or other user PII. UserTrack generates a project id and a secret for it now.</p>
          <div className="space-y-1.5">
            <Label htmlFor="ba-url" className="text-label">Better Auth base URL</Label>
            <Input id="ba-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.example.com/api/auth" className="h-11 bg-background font-mono text-sm" autoComplete="off" />
            <p className="font-mono text-[11px] text-muted-foreground">baseURL + basePath of your Better Auth instance (default /api/auth). UserTrack will call POST …/usertrack/metrics.</p>
          </div>
          <Button className="h-11" disabled={busy} onClick={() => onCreate(false)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Create integration &amp; generate secret</Button>
        </div>
      )}

      {step === "install" && (
        <div className="space-y-4">
          {cred ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Environment variables</div>
              <SecretReveal secret={envSnippet(cred.projectId, cred.secret)} />
              <p className="font-mono text-[11px] text-muted-foreground">Add both to your local env file and to your hosting provider for every environment. Never commit the secret.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-line p-3 text-sm">
              <span className="text-muted-foreground">Secret {existing?.secretPrefix ? `${existing.secretPrefix}…` : ""} was shown once. Lost it?</span>
              <Button size="sm" variant="outline" className="h-9" disabled={busy} onClick={() => onCreate(true)}><RefreshCw className={cn("size-4", busy && "animate-spin")} /> Rotate secret</Button>
            </div>
          )}
          <div>
            <div className="mb-1 text-label">1 · Install</div>
            <Tabs defaultValue="npm">
              <TabsList className="h-8">{PACKAGE_MANAGERS.map((pm) => <TabsTrigger key={pm} value={pm} className="font-mono text-[11px]">{pm}</TabsTrigger>)}</TabsList>
              {PACKAGE_MANAGERS.map((pm) => <TabsContent key={pm} value={pm}><CopyBlock text={INSTALL_COMMANDS[pm]} /></TabsContent>)}
            </Tabs>
          </div>
          <CopyBlock label="2 · Add the plugin to your Better Auth config" text={PLUGIN_SNIPPET} hint="Append userTrack() to your existing plugins array — everything else stays as it is." />
          <CopyBlock label="3 · Environment" text={cred ? envSnippet(cred.projectId, cred.secret) : `${ENV_PROJECT_ID}=${saasId}\n${ENV_SECRET}=ut_int_… (shown once at creation)`} hint="Then deploy your app." />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11" onClick={() => setStep("verify")}>Deployed — verify now</Button>
            <Button variant="ghost" className="h-11" render={<a href="/developers/integrations/better-auth" target="_blank" rel="noreferrer" />}>Docs <ExternalLink className="size-4" /></Button>
          </div>
        </div>
      )}

      {(step === "verify" || step === "done") && (
        <div className="space-y-3">
          {result && <TestResultCard r={result} role="users" />}
          {result?.ok && <CapabilityList caps={result.capabilities} />}
          {step === "done" ? (
            <div className="flex items-center gap-2 text-sm text-pink"><CheckCircle2 className="size-4" /> Verified via Better Auth — first snapshot recorded, syncing every 4 hours.</div>
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

// Status row content for a Better Auth source that has not been verified yet, plus live event info once connected.
export function BetterAuthLive({ saasId }: { saasId: Id<"saas"> }) {
  const summary = useQuery(api.betterAuth.eventSummary, { saasId });
  if (!summary) return null;
  const s = summary.sinceLastSync;
  return (
    <div className="font-mono text-[11px] text-muted-foreground">
      Live events: {s.created} signup{s.created === 1 ? "" : "s"}{s.deleted ? ` · ${s.deleted} deleted` : ""} since last sync{summary.lastEventAt ? ` · last ${timeAgo(summary.lastEventAt)}` : ""}
    </div>
  );
}
