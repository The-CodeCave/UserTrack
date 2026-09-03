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
import { PlatformStep } from "@/components/app/platform-picker";
import { StackQuestions } from "@/components/app/stack-questions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatRate } from "@/lib/format";
import { NO_REVENUE_NOTE, providerLabel, type ProviderKind } from "@/lib/providers-ui";
import { recommendStack, type StackChoices, type StackRecommendation } from "@/lib/stack-recommendation";
import { saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

const STEPS = ["Profile", "Your SaaS", "Platform", "Stack", "Source", "Activation", "Conversion", "Publish"] as const;
const DONE = STEPS.length;
const AI_STEPS = ["Profile", "Set up with AI", "Live"] as const;
const MODE_KEY = "ut:onboarding-mode";
const STACK_KEY = "ut:onboarding-stack";
type Mode = "choose" | "ai" | "manual";

function readMode(): Mode {
  if (typeof window === "undefined") return "choose";
  const m = sessionStorage.getItem(MODE_KEY);
  return m === "ai" || m === "manual" ? m : "choose";
}
function readStack(): StackChoices {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(sessionStorage.getItem(STACK_KEY) ?? "{}"); } catch { return {}; }
}
const stackDone = (s: StackChoices) => Boolean(s.identity && s.analytics && s.monetization);

export default function OnboardingPage() {
  const router = useRouter();
  const me = useQuery(api.profiles.me);
  const mine = useQuery(api.saas.listMine);
  const [override, setOverride] = useState<{ step: number; saasId?: Id<"saas"> } | null>(null);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [stack, setStackState] = useState<StackChoices>(readStack);
  const [aiDone, setAiDone] = useState(false);
  const first = mine?.[0];
  const saasId = override?.saasId ?? first?._id ?? null;
  const derived =
    me === undefined || mine === undefined ? null
    : !me?.profile ? 0
    : !first ? 1
    : !first.projectType ? 2
    : first.trust === "pending" && !first.lastSyncedAt ? (stackDone(stack) ? 4 : 3)
    : 7;
  const step = override?.step ?? derived;
  const setStep = (s: number, id?: Id<"saas">) => setOverride({ step: s, saasId: id ?? override?.saasId });
  const saas = useQuery(api.saas.getMine, saasId ? { id: saasId } : "skip");
  const update = useMutation(api.saas.update);
  const setPublic = useMutation(api.saas.setPublic);
  const complete = useMutation(api.profiles.completeOnboarding);
  const track = useMutation(api.onboarding.track);
  // The AI flow owns the screen after the profile step; the agent creates the project, so `derived` must not take over.
  const ai = mode === "ai" && step !== null && step > 0;
  // Hybrid sees every provider; web / mobile only the ones that apply.
  const platform = saas?.projectType && saas.projectType !== "hybrid" ? saas.projectType : undefined;
  const rec = recommendStack({ platform: saas?.projectType ?? "web", ...stack });

  useEffect(() => {
    if (me?.profile?.onboardingCompleted && override?.step !== DONE && !aiDone) router.replace("/app");
  }, [me, override, aiDone, router]);

  function setMode(m: Mode) {
    setModeState(m);
    if (m === "choose") sessionStorage.removeItem(MODE_KEY); else sessionStorage.setItem(MODE_KEY, m);
  }
  function setStack(s: StackChoices) {
    setStackState(s);
    sessionStorage.setItem(STACK_KEY, JSON.stringify(s));
  }
  // api.saas.update takes the full editable set, so resend what is already there.
  const base = (s: NonNullable<typeof saas>) => ({ id: s._id, name: s.name, description: s.description, websiteUrl: s.websiteUrl, logoUrl: s.logoUrl, category: s.category, tags: s.tags });
  async function finishStack() {
    try {
      if (saas && stack.authMethods?.length) await update({ ...base(saas), authMethods: stack.authMethods });
    } catch (err) {
      toast.error((err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
      return;
    }
    void track({ event: "stack_selected" });
    setStep(4);
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
    setStep(DONE);
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
        <ol className={cn("mb-6 grid gap-1", ai ? "grid-cols-3" : "grid-cols-8")}>
          {steps.map((s, i) => (
            <li key={s} className="space-y-1.5">
              <div className={cn("h-0.5", i < current ? "bg-pink" : i === current ? "bg-foreground" : "bg-line")} />
              <div className={cn("font-mono text-[10px] uppercase tracking-wider", i === current ? "text-foreground" : "hidden text-muted-foreground sm:block")}>{s}</div>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div key={ai ? "ai" : step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <Panel className="p-6">
                <SectionLabel>Step 1 of {DONE}</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create your founder profile</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Your public founder profile groups all your SaaS and growth metrics in one place. Your X handle is optional and never posted to without your say-so.</p>
                <ProfileForm compact defaultName={me?.user.name} submitLabel="Continue" onSaved={() => setStep(1)} />
              </Panel>
            )}
            {ai && <AiSetup onDone={finishAi} onSwitchToManual={() => pick("manual")} />}
            {!ai && step === 1 && (
              <Panel className="p-6">
                <SectionLabel>Step 2 of {DONE}</SectionLabel>
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
            {!ai && step === 2 && saas && (
              <Panel className="p-6">
                <SectionLabel>Step 3 of {DONE}</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">What are you tracking?</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Decides which sources and stack questions you see. UserTrack tracks users, never revenue.</p>
                <PlatformStep initial={saas} onSubmit={async (v) => { await update({ ...base(saas), ...v }); void track({ event: "platform_selected" }); setStep(3); }} />
              </Panel>
            )}
            {!ai && step === 3 && saas?.projectType && (
              <Panel className="p-6">
                <SectionLabel>Step 4 of {DONE}</SectionLabel>
                <StackQuestions key={saas.projectType} platform={saas.projectType} value={stack} onChange={setStack} onDone={finishStack} />
              </Panel>
            )}
            {!ai && step === 4 && saasId && (
              <Panel className="p-6">
                <SectionLabel>Step 5 of {DONE}</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Connect a data source</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Where your registered user count comes from. Read-only, synced every 4 hours. Verified sources get ranked.</p>
                <Recommendation rec={rec} />
                <ConnectSource saasId={saasId} platform={platform} recommended={rec.users ?? undefined} recommendedSource={rec.nativeSource} websiteUrl={saas?.websiteUrl} onConnected={() => setStep(5)} />
              </Panel>
            )}
            {!ai && step === 5 && saasId && (
              <Panel className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionLabel>Step 6 of {DONE} · optional</SectionLabel>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight">Track activation too? (optional)</h1>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setStep(6)}>Skip for now</Button>
                </div>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Activation tells UserTrack how many people actually reach value in your product — e.g. onboarding_completed, project_created.</p>
                <ConnectSource saasId={saasId} role="activation" platform={platform} recommended={rec.activation} onConnected={() => setStep(6)} />
                <Button variant="ghost" className="mt-4 h-11 w-full sm:w-auto" onClick={() => setStep(6)}>Skip for now</Button>
              </Panel>
            )}
            {!ai && step === 6 && saasId && (
              <Panel className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionLabel>Step 7 of {DONE} · optional</SectionLabel>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight">Connect your payment provider? (optional)</h1>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setStep(7)}>Skip for now</Button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Connect your payment provider to see Converted Users — no revenue is read.</p>
                <p className="mb-6 mt-2 font-mono text-[11px] text-muted-foreground">{NO_REVENUE_NOTE}</p>
                <ConnectSource saasId={saasId} role="conversion" platform={platform} recommended={rec.conversion} onConnected={() => setStep(7)} />
                <Button variant="ghost" className="mt-4 h-11 w-full sm:w-auto" onClick={() => setStep(7)}>Skip for now</Button>
              </Panel>
            )}
            {!ai && step === 7 && saas && (
              <Panel className="p-6">
                <SectionLabel>Step 8 of {DONE}</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Publish your growth page</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Here is what people will see at /s/{saas.slug}.</p>
                <div className="mb-4 border border-line p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">{saas.name}</div>
                    <TrustBadge trust={saas.trust} />
                  </div>
                  <div className="text-label mt-3">{saas.projectType === "mobile" ? "Registered users" : "Total users"}</div>
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
                  <Button variant="ghost" className="h-11" onClick={() => setStep(4)}>Change source</Button>
                </div>
              </Panel>
            )}
            {!ai && step === DONE && saas && <Celebrate slug={saas.slug} id={saas._id} hasActivation={saas.integrations.some((i) => i.role === "activation")} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

function Recommendation({ rec }: { rec: StackRecommendation }) {
  const rows: [string, ProviderKind | null | undefined][] = [["Users", rec.users], ["Activation", rec.activation], ["Reach", rec.traffic], ["Conversion", rec.conversion]];
  const picked = rows.filter((r): r is [string, ProviderKind] => Boolean(r[1]));
  if (!picked.length && !rec.notes.length) return null;
  return (
    <div className="mb-5 border border-pink/40 bg-pink/5 p-4">
      <div className="text-label text-pink">Recommended for your stack</div>
      {picked.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs sm:grid-cols-4">
          {picked.map(([label, kind]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{providerLabel(kind)}</dd></div>)}
        </dl>
      )}
      {rec.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {rec.notes.map((n) => <li key={n} className="flex gap-2"><span className="text-pink">→</span><span>{n}</span></li>)}
        </ul>
      )}
    </div>
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
