"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { track as analytics } from "@/lib/analytics";
import { readPreviewDraft, type PreviewDraft } from "@/lib/preview-draft";
import { mcpAgentPrompt } from "@/lib/llm-prompts";
import { connectAgentPrompt } from "@/lib/mcp/snippets";
import { recommendStack } from "@/lib/stack-recommendation";
import { PROFILE_LIMITS } from "@/lib/profile-options";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { SaasLogo } from "@/components/public/saas-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteStep } from "@/components/app/site-step";
import { ConnectSource } from "@/components/app/connect-source";
import { Live, TokenSetup, errMsg, type AiSetupProject } from "@/components/app/ai-setup";

const STEPS = ["Website", "Product", "Your agent", "Live"] as const;
const KEY = "ut:add-saas";
const link = "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

export type Session = { saasId: Id<"saas">; name: string; websiteUrl: string; tokenId?: Id<"developerTokens">; secret?: string; told?: boolean };

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; }
}

// The one way to add a product, from both /app/onboarding and /app/saas/new: the URL, the two fields the backend
// actually requires, then the founder's own coding agent does the technical setup while this screen ticks over.
// `extraSteps` only labels what the caller appends once `onDone` fires — creation itself is the same everywhere.
export function AddSaas({ extraSteps = [], resume, onDone }: { extraSteps?: readonly string[]; resume?: Session | null; onDone: (project: AiSetupProject) => void }) {
  const [session, setSessionState] = useState<Session | null>(readSession);
  const [draft, setDraft] = useState<PreviewDraft | null>(readPreviewDraft);
  const [manual, setManual] = useState(false);
  const createToken = useMutation(api.tokens.create);
  const track = useMutation(api.onboarding.track);
  const status = useQuery(api.onboarding.agentSetupStatus, session?.tokenId ? { tokenId: session.tokenId, saasId: session.saasId } : "skip");
  const minting = useRef(false);
  const fired = useRef(false);

  const setSession = (s: Session | null) => {
    setSessionState(s);
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY);
  };

  // A first-run founder who closes the tab mid-setup comes back to the product they already created, not to step 1.
  useEffect(() => {
    if (!session && resume && !fired.current) setSession(resume);
  }, [session, resume]);

  // The founder never presses "create a token": the key is minted the moment the product exists. A null status means
  // the token is gone (revoked or expired), which mints a fresh one rather than stranding the founder.
  useEffect(() => {
    if (!session || minting.current || (session.tokenId && status !== null)) return;
    minting.current = true;
    void (async () => {
      try {
        const t = await createToken({ type: "mcp", name: "Setup agent", origin: "onboarding", expiresInDays: 7 });
        analytics("token_created", { type: "mcp", origin: "onboarding" });
        await track({ event: "mcp_setup_started" });
        setSession({ ...session, tokenId: t.id, secret: t.secret, told: undefined });
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        minting.current = false;
      }
    })();
  }, [session, status, createToken, track]);

  useEffect(() => {
    if (!status?.done || !status.project || fired.current) return;
    fired.current = true;
    sessionStorage.removeItem(KEY);
    void track({ event: "mcp_setup_completed" });
    onDone(status.project);
  }, [status, onDone, track]);

  // A connected source means the setup is under way whoever started it, so the handoff screen must not come back.
  const phase = !session ? (draft ? "details" : "site") : !session.secret || !status ? "loading" : session.told || status.token.lastUsedAt || status.integration ? "live" : "agent";
  const current = phase === "site" ? 0 : phase === "details" ? 1 : phase === "agent" ? 2 : 3;
  const steps = [...STEPS, ...extraSteps];

  const prompt = session?.secret ? mcpAgentPrompt({ token: session.secret, project: { id: session.saasId, name: session.name, websiteUrl: session.websiteUrl } }) : "";
  const shortPrompt = session ? connectAgentPrompt(session.name) : undefined;
  const copyPrompt = () => track({ event: "agent_prompt_copied" });
  const rec = recommendStack({ platform: draft?.projectType === "hybrid" ? "hybrid" : "web", identity: draft?.identity, analytics: draft?.analytics, monetization: draft?.monetization });

  // Returning to /app/saas/new must be able to mean "another product", not "resume the last one". First-run
  // onboarding has no such choice: there, the one product in flight is the point.
  const restart = extraSteps.length ? null : (
    <button type="button" onClick={() => { setSession(null); setDraft(null); }} className={cn(link, "mt-4 inline-block")}>Add a different product instead</button>
  );

  function goManual() {
    setManual(true);
    void track({ event: "manual_setup_selected" });
  }

  return (
    <>
      <ol className="mb-6 grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={s} className="space-y-1.5">
            <div className={cn("h-0.5", i < current ? "bg-pink" : i === current ? "bg-foreground" : "bg-line")} />
            <div className={cn("font-mono text-[10px] uppercase tracking-wider", i === current ? "text-foreground" : "hidden text-muted-foreground sm:block")}>{s}</div>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={phase} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {phase === "loading" && <Panel className="p-6"><Skeleton className="h-6 w-40" /><Skeleton className="mt-4 h-48 w-full" /></Panel>}

          {phase === "site" && (
            <Panel className="p-6">
              <SectionLabel>Step 1 of {steps.length}</SectionLabel>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">What is your product&apos;s address?</h1>
              <p className="mb-6 mt-1 text-sm text-muted-foreground">One line. We read the page once and fill in everything we can — name, description, icon, category and whether you ship apps.</p>
              <SiteStep onDone={setDraft} />
            </Panel>
          )}

          {phase === "details" && draft && (
            <Panel className="p-6">
              <SectionLabel>Step 2 of {steps.length}</SectionLabel>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Is this right?</h1>
              <p className="mb-6 mt-1 text-sm text-muted-foreground">Only what we cannot do without. Everything else — stack, markets, founders, pricing — waits for you in the product&apos;s settings.</p>
              <Details draft={draft} onCreated={(s) => setSession(s)} onRestart={() => setDraft(null)} />
            </Panel>
          )}

          {phase === "agent" && session?.secret && !manual && (
            <Panel className="p-6">
              <SectionLabel>Step 3 of {steps.length}</SectionLabel>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Hand it to your coding agent</h1>
              <p className="mb-5 mt-1 text-sm text-muted-foreground">Copy the instructions below into Claude Code, Cursor or Codex. Your agent reads the repo, connects the right data source, deploys and verifies it — this screen follows along.</p>
              <TokenSetup prompt={prompt} shortPrompt={shortPrompt} onCopyPrompt={copyPrompt} />
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button className="h-11" onClick={() => setSession({ ...session, told: true })}>I&apos;ve told my agent →</Button>
                <button type="button" onClick={goManual} className={cn(link, "h-11 px-2")}>Connect a source myself instead</button>
              </div>
              {restart}
            </Panel>
          )}

          {phase === "live" && session && status && !manual && (
            <>
              <Live status={status} prompt={prompt} shortPrompt={shortPrompt} onCopyPrompt={copyPrompt} onManual={goManual} onReset={() => setSession({ ...session, tokenId: undefined, secret: undefined, told: undefined })} />
              {restart}
            </>
          )}

          {manual && session && (
            <Panel className="p-6">
              <SectionLabel>Connect a source</SectionLabel>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Where does your user count come from?</h1>
              <p className="mb-6 mt-1 text-sm text-muted-foreground">Read-only, synced every 4 hours. Verified sources get ranked.</p>
              <ConnectSource saasId={session.saasId} websiteUrl={session.websiteUrl} recommended={rec.users ?? undefined} recommendedSource={rec.nativeSource} onConnected={() => setManual(false)} />
              <button type="button" onClick={() => setManual(false)} className={cn(link, "mt-4 inline-block")}>Back to my agent</button>
            </Panel>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// Name and description are the only two things convex/saas.ts:create cannot default; the URL step already answered
// the website, icon, category and platform, and every optional field lives on the product's settings page.
function Details({ draft, onCreated, onRestart }: { draft: PreviewDraft; onCreated: (s: Session) => void; onRestart: () => void }) {
  const create = useMutation(api.saas.create);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    const category = draft.category ?? (String(fd.get("category") ?? "") || undefined);
    setSaving(true);
    try {
      const saasId = await create({
        name,
        description,
        websiteUrl: draft.url,
        tags: [],
        logoUrl: draft.logoStorageId ? undefined : draft.logoUrl,
        logoStorageId: draft.logoStorageId as Id<"_storage"> | undefined,
        category,
        valueProposition: draft.valueProposition,
        projectType: draft.projectType,
        appStoreUrl: draft.appStoreUrl,
        playStoreUrl: draft.playStoreUrl,
      });
      analytics("project_created", { source: "form" });
      onCreated({ saasId, name, websiteUrl: draft.url });
    } catch (err) {
      toast.error(errMsg(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-4">
        <SaasLogo name={draft.name ?? "?"} logoUrl={draft.logoUrl} size={56} />
        <div className="min-w-0 font-mono text-[11px] text-muted-foreground">
          <div className="truncate text-foreground">{draft.url}</div>
          <button type="button" onClick={onRestart} className="underline-offset-4 hover:text-foreground hover:underline">Use a different address</button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-label">Product name</Label>
        <Input id="name" name="name" defaultValue={draft.name} placeholder="Acme Analytics" required minLength={2} maxLength={PROFILE_LIMITS.name} autoFocus className="h-11 bg-background" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-label">Description</Label>
        <Textarea id="description" name="description" defaultValue={draft.description} placeholder="Product analytics for indie SaaS." required rows={3} maxLength={PROFILE_LIMITS.description} className="bg-background" />
      </div>
      {!draft.category && (
        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-label">Category</Label>
          <select id="category" name="category" defaultValue="" required className="h-11 w-full border border-input bg-background px-3 text-sm">
            <option value="" disabled>Pick a category</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
          <p className="font-mono text-[11px] text-muted-foreground">We could not tell from your page. Without one your product is missing from every category board.</p>
        </div>
      )}
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={saving}>
        {saving && <Loader2 className="size-4 animate-spin" />} Create and continue
      </Button>
    </form>
  );
}
