"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, KeyRound, PencilLine, Share2, Sparkles } from "lucide-react";
import { api } from "@convex/_generated/api";
import { track as analytics } from "@/lib/analytics";
import type { Id } from "@convex/_generated/dataModel";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/ui/confetti";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpCallout, ReportProblemButton } from "@/components/site/feedback";
import { CopyForAgent } from "@/components/site/copy-for-agent";
import { mcpAgentPrompt } from "@/lib/llm-prompts";
import { formatCompact, timeAgo } from "@/lib/format";
import { AGENT_PROMPT, mcpSnippets } from "@/lib/mcp/snippets";
import { saasUrl, shareLinkUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

type Status = NonNullable<FunctionReturnType<typeof api.onboarding.agentSetupStatus>>;
export type AiSetupProject = NonNullable<Status["project"]>;
type Session = { tokenId: Id<"developerTokens">; secret: string; told?: boolean };

const KEY = "ut:ai-setup";
const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } };
const link = "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; }
}

function errMsg(e: unknown) {
  return (e instanceof Error ? e.message : "Something went wrong").replace(/^.*Uncaught Error: /, "").split("\n")[0];
}

export function AiSetup({ onDone, onSwitchToManual }: { onDone: (project: AiSetupProject) => void; onSwitchToManual: () => void }) {
  const [session, setSessionState] = useState<Session | null>(readSession);
  const [busy, setBusy] = useState(false);
  const createToken = useMutation(api.tokens.create);
  const track = useMutation(api.onboarding.track);
  const status = useQuery(api.onboarding.agentSetupStatus, session ? { tokenId: session.tokenId } : "skip");
  const fired = useRef(false);

  const setSession = (s: Session | null) => {
    setSessionState(s);
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY);
  };

  useEffect(() => {
    if (!status?.done || !status.project || fired.current) return;
    fired.current = true;
    sessionStorage.removeItem(KEY);
    onDone(status.project);
  }, [status, onDone]);

  async function start() {
    setBusy(true);
    try {
      const t = await createToken({ type: "mcp", name: "Onboarding agent", origin: "onboarding", expiresInDays: 7 });
      analytics("token_created", { type: "mcp", origin: "onboarding" });
      await track({ event: "mcp_setup_started" });
      setSession({ tokenId: t.id, secret: t.secret });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const copyPrompt = () => track({ event: "agent_prompt_copied" });

  // A null status means the token is gone (revoked elsewhere or another account): start over.
  const phase =
    !session || status === null ? "intro"
    : status === undefined ? "loading"
    : status.done && status.project ? "done"
    : session.told || status.token.lastUsedAt ? "status"
    : "connect";

  return (
    <AnimatePresence mode="wait">
      <motion.div key={phase} {...fade}>
        {phase === "loading" && <Panel className="p-6"><Skeleton className="h-6 w-40" /><Skeleton className="mt-4 h-48 w-full" /></Panel>}
        {phase === "intro" && <Intro busy={busy} onStart={start} onManual={onSwitchToManual} />}
        {phase === "connect" && session && (
          <Panel className="p-6">
            <SectionLabel>Connect your agent</SectionLabel>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add UserTrack to your agent</h1>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">Paste the config below into your coding agent, then send it the prompt. This screen updates live once it connects.</p>
            <TokenSetup secret={session.secret} onCopyPrompt={copyPrompt} />
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button className="h-11" onClick={() => setSession({ ...session, told: true })}>I&apos;ve told my agent →</Button>
              <button type="button" onClick={onSwitchToManual} className={cn(link, "h-11 px-2")}>Connect manually instead</button>
            </div>
          </Panel>
        )}
        {phase === "status" && session && status && <Live status={status} secret={session.secret} onCopyPrompt={copyPrompt} onManual={onSwitchToManual} onReset={() => setSession(null)} />}
        {phase === "done" && status?.project && <Done project={status.project} />}
      </motion.div>
    </AnimatePresence>
  );
}

// Chooser cards shared by onboarding and "add a product".
export function SetupChooser({ onPick }: { onPick: (mode: "ai" | "manual") => void }) {
  const card = "group relative flex min-h-40 flex-col border bg-background p-4 text-left transition-colors";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => onPick("ai")} className={cn(card, "border-pink/50 hover:border-pink hover:bg-pink/5")}>
        <span className="absolute right-3 top-3 border border-pink/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-pink">Recommended</span>
        <Sparkles className="size-5 text-pink" />
        <span className="mt-3 font-semibold">Set up with AI</span>
        <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
          {["detects your stack", "connects users, activation & conversion — never revenue", "returns your public URL"].map((t) => (
            <li key={t} className="flex gap-2"><span className="text-pink">→</span>{t}</li>
          ))}
        </ul>
      </button>
      <button type="button" onClick={() => onPick("manual")} className={cn(card, "border-line hover:border-line-strong hover:bg-card")}>
        <PencilLine className="size-5 text-muted-foreground" />
        <span className="mt-3 font-semibold">Connect manually</span>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Fill in your product details and connect a read-only data source yourself. About three minutes.</p>
      </button>
    </div>
  );
}

function Intro({ busy, onStart, onManual }: { busy: boolean; onStart: () => void; onManual: () => void }) {
  return (
    <Panel className="p-6">
      <SectionLabel><Sparkles className="size-3 text-pink" /> Set up with AI</SectionLabel>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Let your coding agent set up UserTrack</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your agent can detect your SaaS stack, create the project, configure tracking and verify the integration. You stay in control: read-only credentials, no deletion, revoke any time.</p>
      <ol className="mt-5 space-y-2 border-y border-line py-4 font-mono text-xs">
        {["Create a short-lived MCP token", "Paste one line into your agent", "Watch it go live, step by step"].map((t, i) => (
          <li key={t} className="flex items-center gap-3"><span className="text-pink">0{i + 1}</span><span>{t}</span></li>
        ))}
      </ol>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button className="h-11" onClick={onStart} disabled={busy}><KeyRound /> {busy ? "Creating token…" : "Create MCP token"}</Button>
        <button type="button" onClick={onManual} className={cn(link, "h-11 px-2")}>Connect manually instead</button>
      </div>
    </Panel>
  );
}

function useCopy(text: string, onCopy?: () => void) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

function CopyBlock({ text, className }: { text: string; className?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <div className="relative border border-line bg-background">
      <pre className={cn("overflow-x-auto whitespace-pre-wrap break-all p-3 pr-11 font-mono text-[12px] leading-relaxed", className)}>{text}</pre>
      <button type="button" onClick={copy} aria-label="Copy" className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center text-muted-foreground hover:text-foreground">
        {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

function TokenSetup({ secret, onCopyPrompt }: { secret: string; onCopyPrompt: () => void }) {
  const snippets = mcpSnippets(secret);
  const prompt = useCopy(AGENT_PROMPT, onCopyPrompt);
  return (
    <div className="space-y-5">
      <div>
        <div className="text-label mb-1.5">Your MCP token</div>
        <CopyBlock text={secret} className="text-pink" />
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
          This token will only be shown once. It expires in 7 days and can be revoked under Developer.
        </p>
      </div>
      <div>
        <div className="text-label mb-1.5">Add the UserTrack MCP server</div>
        <Tabs defaultValue={snippets[0].id}>
          <TabsList variant="line" className="w-full flex-wrap justify-start gap-x-2 gap-y-1 p-0 group-data-horizontal/tabs:h-auto">
            {snippets.map((s) => <TabsTrigger key={s.id} value={s.id} className="h-8 flex-none px-1.5 font-mono text-xs">{s.label}</TabsTrigger>)}
          </TabsList>
          {snippets.map((s) => (
            <TabsContent key={s.id} value={s.id} className="mt-2">
              <CopyBlock text={s.text} />
              {s.hint && <p className="mt-1.5 text-xs text-muted-foreground">{s.hint}</p>}
            </TabsContent>
          ))}
        </Tabs>
      </div>
      <div className="border border-pink/40 bg-pink/5 p-4">
        <div className="text-label text-pink">Tell your agent:</div>
        <blockquote className="mt-2 border-l-2 border-pink pl-3 font-mono text-[13px] leading-relaxed">&ldquo;{AGENT_PROMPT}&rdquo;</blockquote>
        <CopyForAgent
          surface="mcp-setup"
          className="mt-3"
          label="Copy full setup for AI agent"
          prompt={mcpAgentPrompt({ token: secret })}
          hint="Includes the MCP config, your token, the stack-detection plan and the safety rules."
        />
        <button type="button" onClick={prompt.copy} className="mt-3 inline-flex h-8 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
          {prompt.copied ? <Check className="size-3.5 text-pink" /> : <Copy className="size-3.5" />} {prompt.copied ? "Copied" : "Copy the short prompt instead"}
        </button>
      </div>
    </div>
  );
}

function Live({ status, secret, onCopyPrompt, onManual, onReset }: { status: Status; secret: string; onCopyPrompt: () => void; onManual: () => void; onReset: () => void }) {
  const [showSetup, setShowSetup] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const setPublic = useMutation(api.saas.setPublic);
  const { project, steps, error, recent, lastActivityAt, token } = status;
  const verified = steps.find((s) => s.key === "verified")?.done;
  const waiting = !lastActivityAt;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function publish() {
    if (!project) return;
    try {
      await setPublic({ id: project.id, isPublic: true });
      analytics("project_published");
    } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <Panel className="p-6">
      <SectionLabel>Live status</SectionLabel>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{waiting ? "Waiting for your agent" : "Your agent is working"}</h1>
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="relative flex size-2">
            <span className={cn("absolute inline-flex size-full bg-pink opacity-75", waiting ? "animate-ping" : "animate-pulse")} />
            <span className="relative inline-flex size-2 bg-pink" />
          </span>
          {waiting ? "Waiting for agent…" : `Last activity: ${timeAgo(lastActivityAt, now)}`}
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Updates live as your agent calls UserTrack. Keep this tab open.</p>

      <ol className="mt-5 space-y-2.5 border-y border-line py-4 font-mono text-sm">
        {steps.map((s) => <StepRow key={s.key} step={s} now={now} />)}
      </ol>

      {token.revokedAt && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border border-amber-400/40 bg-amber-400/5 p-3 text-sm">
          <span>This token was revoked. Your agent can no longer reach UserTrack.</span>
          <Button size="sm" variant="outline" onClick={onReset}>Start over</Button>
        </div>
      )}
      {error && (
        <div className="mt-4 border border-red-500/40 bg-red-500/5 p-3">
          <div className="text-label text-red-400">Integration error</div>
          <p className="mt-1 break-words font-mono text-xs leading-relaxed">{error}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">Your agent sees the same error and can retry with a different configuration.</p>
          <div className="mt-2"><ReportProblemButton surface="ai-setup-error" defaultMessage={`My agent setup failed with:\n\n${error}\n\nWhat should I do?`} /></div>
        </div>
      )}
      {project && !project.isPublic && verified && (
        <div className="mt-4 flex flex-col gap-2 border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Data verified. The page isn&apos;t public yet — you can publish it yourself.</p>
          <Button className="h-10 shrink-0" onClick={publish}>Publish now</Button>
        </div>
      )}
      {recent.length > 0 && (
        <div className="mt-4">
          <div className="text-label mb-1.5">Activity</div>
          <ul className="divide-y divide-line border border-line font-mono text-[11px]">
            {recent.map((r, i) => (
              <motion.li key={`${r.at}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className={cn("size-1.5 shrink-0", r.ok ? "bg-pink" : "bg-red-400")} />
                <span className="truncate">{r.action}</span>
                {!r.ok && <span className="text-red-400">failed</span>}
                <span className="ml-auto shrink-0 text-muted-foreground">{timeAgo(r.at, now)}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <button type="button" onClick={() => setShowSetup((v) => !v)} className="inline-flex h-9 items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn("size-3.5 transition-transform", showSetup && "rotate-180")} />
          {showSetup ? "Hide token setup" : "Show token setup again"}
        </button>
        <button type="button" onClick={onManual} className="h-9 text-muted-foreground hover:text-foreground">Switch to manual</button>
      </div>
      <HelpCallout surface="ai-setup" className="mt-5" title="Agent not moving?">
        If nothing happens for a few minutes, your agent probably could not reach the MCP server. Send me the client you use and what it printed — I will tell you the fix.
      </HelpCallout>
      <AnimatePresence initial={false}>
        {showSetup && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="pt-4"><TokenSetup secret={secret} onCopyPrompt={onCopyPrompt} /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}

function StepRow({ step, now }: { step: Status["steps"][number]; now: number }) {
  const tone = step.state === "done" ? "text-pink" : step.state === "active" ? "text-foreground" : "text-muted-foreground";
  return (
    <li className={cn("flex items-center gap-3", step.state === "pending" && "text-muted-foreground")}>
      <span className={cn("inline-flex shrink-0 items-center", tone)}>
        [<span className="inline-flex w-4 items-center justify-center">
          {step.state === "done" && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}><Check className="size-3.5" /></motion.span>}
          {step.state === "active" && <motion.span animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}>→</motion.span>}
        </span>]
      </span>
      <span className={cn("min-w-0 truncate", step.state === "active" && "animate-pulse")}>{step.label}</span>
      {step.done && step.at !== undefined && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeAgo(step.at, now)}</span>}
    </li>
  );
}

function Done({ project }: { project: AiSetupProject }) {
  const url = saasUrl(project.slug);
  const { copied, copy } = useCopy(url);
  const v = project.verification;
  const eligible = v.level === "verified" && project.isPublic;
  const eligibility =
    eligible ? "Eligible for leaderboards"
    : !project.isPublic ? "Not public yet — publish to be ranked"
    : v.label === "Data under review" ? "Under review — excluded until the next review"
    : v.level === "unverified" ? "Self-reported data is never ranked"
    : "Ranked after a healthy sync history";
  return (
    <Panel className="pink-glow p-6">
      <Confetti />
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
        <Sparkles className="size-8 text-pink" />
      </motion.div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">You&apos;re live on UserTrack.</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your agent finished the setup. Here is what people will see.</p>
      <div className="mt-5 border border-line bg-background p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-lg font-semibold">{project.name}</div>
          <TrustBadge trust={v.level} label={v.label} className="shrink-0" />
        </div>
        <div className="text-label mt-3">Total users</div>
        <div className="tabular text-4xl font-semibold text-pink">{formatCompact(project.metrics.totalUsers)}</div>
        <dl className="mt-4 grid gap-3 border-t border-line pt-3 font-mono text-xs sm:grid-cols-2">
          <div><dt className="text-label">Leaderboards</dt><dd className={cn("mt-1", eligible ? "text-pink" : "text-muted-foreground")}>{eligibility}</dd></div>
          <div><dt className="text-label">Next sync</dt><dd className="mt-1 text-muted-foreground">within 4 hours</dd></div>
        </dl>
      </div>
      <div className="mt-4 flex items-center gap-2 border border-line bg-background px-3 py-2 font-mono text-sm">
        <span className="min-w-0 flex-1 truncate">{url}</span>
        <button type="button" onClick={copy} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy link">
          {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button className="h-11" render={<a href={url} target="_blank" rel="noreferrer" />}>View public page <ExternalLink className="size-4" /></Button>
        <Button variant="outline" className="h-11" render={<a href={shareLinkUrl(project.slug, "users", "ai-setup")} target="_blank" rel="noreferrer" />}><Share2 className="size-4" /> Share</Button>
        <Button variant="ghost" className="h-11" render={<Link href="/app" />}>Go to dashboard</Button>
      </div>
    </Panel>
  );
}
