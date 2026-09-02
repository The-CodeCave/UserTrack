"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, PartyPopper } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Logo } from "@/components/site/logo";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { ProfileForm } from "@/components/app/profile-form";
import { SaasForm } from "@/components/app/saas-form";
import { ConnectSource, SourceStatus } from "@/components/app/connect-source";
import { AiSetup, SetupChooser } from "@/components/app/ai-setup";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatRate } from "@/lib/format";
import { saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

const STEPS = ["Profile", "Your SaaS", "Data source", "Activation", "Publish"] as const;
const AI_STEPS = ["Profile", "Set up with AI", "Live"] as const;
const MODE_KEY = "ut:onboarding-mode";
type Mode = "choose" | "ai" | "manual";

function readMode(): Mode {
  if (typeof window === "undefined") return "choose";
  const m = sessionStorage.getItem(MODE_KEY);
  return m === "ai" || m === "manual" ? m : "choose";
}

export default function OnboardingPage() {
  const router = useRouter();
  const me = useQuery(api.profiles.me);
  const mine = useQuery(api.saas.listMine);
  const [override, setOverride] = useState<{ step: number; saasId?: Id<"saas"> } | null>(null);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [aiDone, setAiDone] = useState(false);
  const first = mine?.[0];
  const saasId = override?.saasId ?? first?._id ?? null;
  const derived =
    me === undefined || mine === undefined ? null
    : !me?.profile ? 0
    : !first ? 1
    : first.trust === "pending" && !first.lastSyncedAt ? 2
    : 4;
  const step = override?.step ?? derived;
  const setStep = (s: number, id?: Id<"saas">) => setOverride({ step: s, saasId: id ?? override?.saasId });
  const saas = useQuery(api.saas.getMine, saasId ? { id: saasId } : "skip");
  const setPublic = useMutation(api.saas.setPublic);
  const complete = useMutation(api.profiles.completeOnboarding);
  const track = useMutation(api.onboarding.track);
  // The AI flow owns the screen after the profile step; the agent creates the project, so `derived` must not take over.
  const ai = mode === "ai" && step !== null && step > 0;

  useEffect(() => {
    if (me?.profile?.onboardingCompleted && override?.step !== 5 && !aiDone) router.replace("/app");
  }, [me, override, aiDone, router]);

  function setMode(m: Mode) {
    setModeState(m);
    if (m === "choose") sessionStorage.removeItem(MODE_KEY); else sessionStorage.setItem(MODE_KEY, m);
  }
  function pick(m: "ai" | "manual") {
    setMode(m);
    void track({ event: m === "ai" ? "onboarding_ai_setup_selected" : "manual_setup_selected" });
  }
  async function finishAi() {
    setAiDone(true);
    sessionStorage.removeItem(MODE_KEY);
    await complete();
    await track({ event: "mcp_setup_completed" });
    toast.success("You're live!");
  }

  async function publish() {
    if (!saasId) return;
    await setPublic({ id: saasId, isPublic: true });
    await complete();
    toast.success("You're live!");
    setStep(5);
  }

  if (step === null || me === undefined) {
    return <div className="mx-auto max-w-xl p-6"><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-72 w-full" /></div>;
  }

  const steps = ai ? AI_STEPS : STEPS;
  const current = ai ? (aiDone ? 2 : 1) : step;

  return (
    <main className="relative min-h-full flex-1 px-4 py-8 sm:py-14">
      <div aria-hidden className="bp-grid bp-grid-fade absolute inset-0 -z-10" />
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mb-8 inline-block"><Logo /></Link>
        <ol className={cn("mb-6 grid gap-1", ai ? "grid-cols-3" : "grid-cols-5")}>
          {steps.map((s, i) => (
            <li key={s} className="space-y-1.5">
              <div className={cn("h-0.5", i < current ? "bg-pink" : i === current ? "bg-foreground" : "bg-line")} />
              <div className={cn("font-mono text-[10px] uppercase tracking-wider", i === current ? "text-foreground" : "text-muted-foreground")}>{s}</div>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div key={ai ? "ai" : step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <Panel className="p-6">
                <SectionLabel>Step 1 of 5</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create your founder profile</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">This is the page your SaaS listings link back to.</p>
                <ProfileForm compact defaultName={me?.user.name} submitLabel="Continue" onSaved={() => setStep(1)} />
              </Panel>
            )}
            {ai && <AiSetup onDone={finishAi} onSwitchToManual={() => pick("manual")} />}
            {!ai && step === 1 && (
              <Panel className="p-6">
                <SectionLabel>Step 2 of 5</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add your SaaS</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">{mode === "manual" ? "You can add more products later from the dashboard." : "Pick how you want to get on the board."}</p>
                {mode === "manual" ? (
                  <>
                    <SaasForm submitLabel="Continue" onSaved={(id) => setStep(2, id)} />
                    <button type="button" onClick={() => pick("ai")} className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Set up with AI instead</button>
                  </>
                ) : (
                  <SetupChooser onPick={pick} />
                )}
              </Panel>
            )}
            {!ai && step === 2 && saasId && (
              <Panel className="p-6">
                <SectionLabel>Step 3 of 5</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Connect a data source</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Read-only. Synced every 4 hours. Verified sources get ranked — traffic, activation and revenue can be added later.</p>
                <ConnectSource saasId={saasId} onConnected={() => setStep(3)} />
              </Panel>
            )}
            {!ai && step === 3 && saasId && (
              <Panel className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionLabel>Step 4 of 5 · optional</SectionLabel>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight">Track activation too? (optional)</h1>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setStep(4)}>Skip for now</Button>
                </div>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Activation tells UserTrack how many people actually reach value in your product — e.g. onboarding_completed, project_created.</p>
                <ConnectSource saasId={saasId} role="activation" onConnected={() => setStep(4)} />
                <Button variant="ghost" className="mt-4 h-11 w-full sm:w-auto" onClick={() => setStep(4)}>Skip for now</Button>
              </Panel>
            )}
            {!ai && step === 4 && saas && (
              <Panel className="p-6">
                <SectionLabel>Step 5 of 5</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Publish your growth page</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Here is what people will see at /s/{saas.slug}.</p>
                <div className="mb-4 border border-line p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">{saas.name}</div>
                    <TrustBadge trust={saas.trust} />
                  </div>
                  <div className="text-label mt-3">Total users</div>
                  <div className="tabular text-4xl font-semibold text-pink">{formatCompact(saas.totalUsers)}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div><div className="text-label">Recent growth</div><div className="font-mono text-sm">{formatDelta(saas.newUsers7d)} in 7d</div></div>
                    {saas.activatedUsers !== undefined && <div><div className="text-label">Activation</div><div className="font-mono text-sm">{formatRate(saas.activationRatePct)} · {formatCompact(saas.activatedUsers)} activated</div></div>}
                  </div>
                  <div className="mt-3 truncate font-mono text-[11px] text-muted-foreground">{saasUrl(saas.slug)}</div>
                </div>
                {saas.integrations[0] && <div className="mb-6"><SourceStatus saasId={saas._id} integration={saas.integrations[0]} totalUsers={saas.totalUsers} trust={saas.trust} trustLabel={saas.trustLabel} /></div>}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="h-11" onClick={publish}>Publish page</Button>
                  <Button variant="ghost" className="h-11" onClick={() => setStep(2)}>Change source</Button>
                </div>
              </Panel>
            )}
            {!ai && step === 5 && saas && <Celebrate slug={saas.slug} id={saas._id} hasActivation={saas.integrations.some((i) => i.role === "activation")} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

function Celebrate({ slug, id, hasActivation }: { slug: string; id: Id<"saas">; hasActivation: boolean }) {
  const url = saasUrl(slug);
  const [copied, setCopied] = useState(false);
  return (
    <Panel className="pink-glow p-6 text-center">
      <PartyPopper className="mx-auto size-8 text-pink" />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">You&apos;re on the board</h1>
      <p className="mt-1 text-sm text-muted-foreground">Share your growth page. It comes with a custom preview image.</p>
      <div className="mt-5 flex items-center gap-2 border border-line bg-background px-3 py-2 font-mono text-sm">
        <span className="truncate">{url}</span>
        <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy link">
          {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button className="h-11" render={<a href={url} target="_blank" rel="noreferrer" />}>Open page <ExternalLink className="size-4" /></Button>
        <Button variant="outline" className="h-11" render={<Link href="/app" />}>Go to dashboard</Button>
      </div>
      {!hasActivation && (
        <div className="mt-6 border-t border-line pt-4 text-left">
          <div className="text-label">Next: activation (optional)</div>
          <p className="mt-1 text-xs text-muted-foreground">Signups are a weak signal. Add an activation event (PostHog, Supabase table or your endpoint) to show activated users, activation rate and a stronger trending score.</p>
          <Button variant="ghost" size="sm" className="mt-2 px-0 text-pink" render={<Link href={`/app/saas/${id}#integrations`} />}>Set up activation →</Button>
        </div>
      )}
    </Panel>
  );
}
