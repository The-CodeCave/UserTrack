"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, PartyPopper } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { track as analytics, type AuthMethod } from "@/lib/analytics";
import { readAttribution } from "@/lib/attribution";
import { readPreviewDraft } from "@/lib/preview-draft";
import { Logo } from "@/components/site/logo";
import { HelpCallout } from "@/components/site/feedback";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { ProfileForm } from "@/components/app/profile-form";
import { SaasForm } from "@/components/app/saas-form";
import { ConnectSource, SourceStatus } from "@/components/app/connect-source";
import { AiDone, AiSetup, SetupChooser, type AiSetupProject } from "@/components/app/ai-setup";
import { PlatformStep } from "@/components/app/platform-picker";
import { StackQuestions } from "@/components/app/stack-questions";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/ui/confetti";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatRate } from "@/lib/format";
import { NO_REVENUE_NOTE, providerLabel, type ProviderKind } from "@/lib/providers-ui";
import { recommendStack, type StackChoices, type StackRecommendation } from "@/lib/stack-recommendation";
import { profileUrl, saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

// Profile comes last: the founder sees the product before being asked for their own handle (A234).
const STEPS = ["Your SaaS", "Platform", "Stack", "Source", "Activation", "Conversion", "Profile", "Publish"] as const;
const DONE = STEPS.length;
const PROFILE_STEP = STEPS.indexOf("Profile");
const AI_STEPS = ["Set up with AI", "Profile", "Live"] as const;
const SOCIAL_METHODS: readonly AuthMethod[] = ["google", "github", "x"];
const MODE_KEY = "ut:onboarding-mode";
const STACK_KEY = "ut:onboarding-stack";
type Mode = "choose" | "ai" | "manual";

function readMode(): Mode {
  if (typeof window === "undefined") return "choose";
  const m = sessionStorage.getItem(MODE_KEY);
  return m === "ai" || m === "manual" ? m : "choose";
}
// The founder's own answers win; until they give any, the providers /preview read off their website stand in.
function readStack(): StackChoices {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(sessionStorage.getItem(STACK_KEY) ?? "null");
    if (stored && typeof stored === "object") return stored;
  } catch {}
  const d = readPreviewDraft();
  return d ? { identity: d.identity, analytics: d.analytics, monetization: d.monetization } : {};
}
const stackAnswered = () => typeof window !== "undefined" && sessionStorage.getItem(STACK_KEY) !== null;
const stackDone = (s: StackChoices) => Boolean(s.identity && s.analytics && s.monetization);

export default function OnboardingPage() {
  const router = useRouter();
  const me = useQuery(api.profiles.me);
  const mine = useQuery(api.saas.listMine);
  const [override, setOverride] = useState<{ step: number; saasId?: Id<"saas"> } | null>(null);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [stack, setStackState] = useState<StackChoices>(readStack);
  const [draft] = useState(readPreviewDraft);
  const [stackFromSite] = useState(() => !stackAnswered() && Boolean(readStack().identity));
  const [aiDone, setAiDone] = useState(false);
  const [aiProject, setAiProject] = useState<AiSetupProject | null>(null);
  const first = mine?.[0];
  const saasId = override?.saasId ?? first?._id ?? null;
  const derived =
    me === undefined || mine === undefined || !me?.profile ? null
    : !first ? 0
    : !first.projectType ? 1
    : first.trust === "pending" && !first.lastSyncedAt ? (stackDone(stack) ? 3 : 2)
    : me.profile.handleConfirmed === false ? PROFILE_STEP
    : 7;
  const step = override?.step ?? derived;
  const setStep = (s: number, id?: Id<"saas">) => {
    setOverride({ step: s, saasId: id ?? override?.saasId });
    analytics("onboarding_step", { step: STEPS[s] ?? "done", platform: saas?.projectType });
  };
  const saas = useQuery(api.saas.getMine, saasId ? { id: saasId } : "skip");
  const update = useMutation(api.saas.update);
  const setPublic = useMutation(api.saas.setPublic);
  const complete = useMutation(api.profiles.completeOnboarding);
  const ensure = useMutation(api.profiles.ensure);
  const track = useMutation(api.onboarding.track);
  // The AI flow owns the screen: the agent creates the project, so `derived` must not take over.
  const ai = mode === "ai";
  // Hybrid sees every provider; web / mobile only the ones that apply.
  const platform = saas?.projectType && saas.projectType !== "hybrid" ? saas.projectType : undefined;
  const rec = recommendStack({ platform: saas?.projectType ?? "web", ...stack });

  useEffect(() => {
    if (me?.profile?.onboardingCompleted && override?.step !== DONE && !aiDone) router.replace("/app");
  }, [me, override, aiDone, router]);

  // saas.ownerId needs a profile row before the founder has picked a handle; it stays unconfirmed until the profile step.
  useEffect(() => {
    if (me && !me.profile) void ensure().catch((err: Error) => toast.error(err.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]));
  }, [me, ensure]);

  // Social sign-ups only complete once the OAuth redirect lands here; `?new=` carries the provider.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("new") as AuthMethod | null;
    if (!m) return;
    window.history.replaceState(null, "", "/app/onboarding");
    if (SOCIAL_METHODS.includes(m)) analytics("sign_up_completed", { method: m, ref: readAttribution()?.ref });
  }, []);

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
    setStep(3);
  }
  function pick(m: "ai" | "manual") {
    setMode(m);
    void track({ event: m === "ai" ? "onboarding_ai_setup_selected" : "manual_setup_selected" });
  }
  function aiSetupDone(project: AiSetupProject) {
    setAiProject(project);
    analytics("project_created", { source: "mcp" });
  }
  async function finishAi() {
    setAiDone(true);
    sessionStorage.removeItem(MODE_KEY);
    await complete();
    analytics("onboarding_completed");
    await track({ event: "mcp_setup_completed" });
    toast.success("You're live!");
  }

  async function publish() {
    if (!saasId) return;
    try {
      await setPublic({ id: saasId, isPublic: true });
      await complete();
      analytics("project_published");
      analytics("onboarding_completed");
    } catch (err) {
      toast.error(/Uncaught \w*Error: ([^\n]*)/.exec((err as Error).message)?.[1] ?? "Could not publish the page");
      return;
    }
    toast.success("You're live!");
    setStep(DONE);
  }

  if (step === null || me === undefined) {
    return <div className="mx-auto max-w-xl p-6"><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-72 w-full" /></div>;
  }

  const steps = ai ? AI_STEPS : STEPS;
  const current = ai ? (aiDone ? 2 : aiProject ? 1 : 0) : step;

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
          <motion.div key={ai ? (aiDone ? "ai-done" : aiProject ? "ai-profile" : "ai") : step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {ai && !aiProject && <AiSetup onDone={aiSetupDone} onSwitchToManual={() => pick("manual")} />}
            {ai && aiProject && !aiDone && me?.profile && <ProfileStep profile={me.profile} step="Step 2 of 3" onSaved={finishAi} />}
            {ai && aiDone && aiProject && <AiDone project={aiProject} />}
            {!ai && step === 0 && (
              <Panel className="p-6">
                <SectionLabel>Step 1 of {DONE}</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add your SaaS</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">{mode === "manual" ? "You can add more products later from the dashboard." : "Pick how you want to get on the board."}</p>
                {mode === "manual" ? (
                  <>
                    <SaasForm fromPreview={draft} submitLabel="Continue" onSaved={(id) => setStep(1, id)} />
                    <button type="button" onClick={() => pick("ai")} className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Set up with AI instead</button>
                  </>
                ) : (
                  <SetupChooser onPick={pick} />
                )}
              </Panel>
            )}
            {!ai && step === 1 && saas && (
              <Panel className="p-6">
                <SectionLabel>Step 2 of {DONE}</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">What are you tracking?</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Decides which sources and stack questions you see. UserTrack tracks users, never revenue.</p>
                <PlatformStep initial={{ projectType: saas.projectType ?? draft?.projectType, appStoreUrl: saas.appStoreUrl ?? draft?.appStoreUrl, playStoreUrl: saas.playStoreUrl ?? draft?.playStoreUrl }} onSubmit={async (v) => { await update({ ...base(saas), ...v }); void track({ event: "platform_selected" }); setStep(2); }} />
              </Panel>
            )}
            {!ai && step === 2 && saas?.projectType && (
              <Panel className="p-6">
                <SectionLabel>Step 3 of {DONE}</SectionLabel>
                <StackQuestions key={saas.projectType} platform={saas.projectType} value={stack} onChange={setStack} onDone={finishStack} />
              </Panel>
            )}
            {!ai && step === 3 && saasId && (
              <Panel className="p-6">
                <SectionLabel>Step 4 of {DONE}</SectionLabel>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Connect a data source</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Where your registered user count comes from. Read-only, synced every 4 hours. Verified sources get ranked.</p>
                <Recommendation rec={rec} fromSite={stackFromSite} />
                <ConnectSource saasId={saasId} platform={platform} recommended={rec.users ?? undefined} recommendedSource={rec.nativeSource} websiteUrl={saas?.websiteUrl} onConnected={() => setStep(4)} />
              </Panel>
            )}
            {!ai && step === 4 && saasId && (
              <Panel className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionLabel>Step 5 of {DONE} · optional</SectionLabel>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight">Track activation too? (optional)</h1>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setStep(5)}>Skip for now</Button>
                </div>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">Activation tells UserTrack how many people actually reach value in your product — e.g. onboarding_completed, project_created.</p>
                <ConnectSource saasId={saasId} role="activation" platform={platform} recommended={rec.activation} onConnected={() => setStep(5)} />
                <Button variant="ghost" className="mt-4 h-11 w-full sm:w-auto" onClick={() => setStep(5)}>Skip for now</Button>
              </Panel>
            )}
            {!ai && step === 5 && saasId && (
              <Panel className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionLabel>Step 6 of {DONE} · optional</SectionLabel>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight">Connect your payment provider? (optional)</h1>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setStep(6)}>Skip for now</Button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Connect your payment provider to see Converted Users — no revenue is read.</p>
                <p className="mb-6 mt-2 font-mono text-[11px] text-muted-foreground">{NO_REVENUE_NOTE}</p>
                <ConnectSource saasId={saasId} role="conversion" platform={platform} recommended={rec.conversion} onConnected={() => setStep(6)} />
                <Button variant="ghost" className="mt-4 h-11 w-full sm:w-auto" onClick={() => setStep(6)}>Skip for now</Button>
              </Panel>
            )}
            {!ai && step === PROFILE_STEP && me?.profile && <ProfileStep profile={me.profile} step={`Step ${PROFILE_STEP + 1} of ${DONE}`} onSaved={() => setStep(7)} />}
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
                  <Button variant="ghost" className="h-11" onClick={() => setStep(3)}>Change source</Button>
                </div>
              </Panel>
            )}
            {!ai && step === DONE && saas && <Celebrate slug={saas.slug} id={saas._id} hasActivation={saas.integrations.some((i) => i.role === "activation")} />}
          </motion.div>
        </AnimatePresence>

        <HelpCallout surface="onboarding" className="mt-6" title="Stuck on this step?">
          Onboarding is where most things break. If a provider will not connect, a number looks wrong or a step makes no sense — write it here and it lands in my inbox with the step you are on. I am one founder, I read all of it and usually reply the same day.
        </HelpCallout>
      </div>
    </main>
  );
}

// The founder's own handle, asked once the product exists — so the page it names is already real.
function ProfileStep({ profile, step, onSaved }: { profile: Doc<"profiles">; step: string; onSaved: () => void }) {
  return (
    <Panel className="p-6">
      <SectionLabel>{step}</SectionLabel>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Name your founder page</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Everything you track lands on <span className="font-mono text-foreground">{profileUrl(profile.username)}</span> — we picked that handle from your name, change it below if you want another one. Your X handle is optional and never posted to without your say-so.
      </p>
      <ProfileForm compact initial={profile} submitLabel="Continue" onSaved={onSaved} />
    </Panel>
  );
}

function Recommendation({ rec, fromSite }: { rec: StackRecommendation; fromSite?: boolean }) {
  const rows: [string, ProviderKind | null | undefined][] = [["Users", rec.users], ["Activation", rec.activation], ["Reach", rec.traffic], ["Conversion", rec.conversion]];
  const picked = rows.filter((r): r is [string, ProviderKind] => Boolean(r[1]));
  if (!picked.length && !rec.notes.length) return null;
  return (
    <div className="mb-5 border border-pink/40 bg-pink/5 p-4">
      <div className="text-label text-pink">Recommended for your stack</div>
      {fromSite && <p className="mt-1 text-xs text-muted-foreground">Read off your website — pick a different source below if this is wrong.</p>}
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
      <Confetti />
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
