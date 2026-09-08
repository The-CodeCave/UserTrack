"use client";

import { useState, type ReactNode } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { Bug, Check, LifeBuoy, Lightbulb, Loader2, MessageSquare, MessageSquarePlus, Send, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import { track } from "@/lib/analytics";
import { APP_VERSION } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const SUPPORT_EMAIL = "hello@usertrack.dev";
export type FeedbackKind = "bug" | "idea" | "question" | "other";

const KINDS = [
  { key: "bug", label: "Bug", Icon: Bug, placeholder: "What did you do, what happened, what did you expect? A URL or screenshot description helps." },
  { key: "question", label: "Need help", Icon: LifeBuoy, placeholder: "Where are you stuck? Which provider or step are you trying to set up?" },
  { key: "idea", label: "Idea", Icon: Lightbulb, placeholder: "What would make UserTrack more useful for you?" },
  { key: "other", label: "Other", Icon: MessageSquare, placeholder: "Anything else you want to tell me." },
] as const;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Could not send").replace(/^.*Uncaught Error: /, "").split("\n")[0];

function useSendFeedback() {
  const { isAuthenticated } = useConvexAuth();
  const submit = useMutation(api.feedback.submit);
  return async (input: { kind: FeedbackKind; message: string; email?: string }) => {
    const payload = {
      ...input,
      email: input.email?.trim() || undefined,
      path: typeof window === "undefined" ? undefined : window.location.pathname,
      appVersion: APP_VERSION,
      userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent.slice(0, 300),
    };
    if (isAuthenticated) {
      await submit(payload);
      return;
    }
    const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.text()) || "Could not send your report");
  };
}

// The panel itself: kind picker, message, optional email. Anchored bottom-right by the FAB, centered by the callouts.
function FeedbackForm({ defaultKind = "bug", defaultMessage = "", onClose }: { defaultKind?: FeedbackKind; defaultMessage?: string; onClose: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const send = useSendFeedback();
  const [kind, setKind] = useState<FeedbackKind>(defaultKind);
  const [message, setMessage] = useState(defaultMessage);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const active = KINDS.find((k) => k.key === kind)!;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await send({ kind, message, email });
      track("feedback_sent", { kind });
      setSent(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="p-5 text-center">
        <Check className="mx-auto size-7 text-pink" />
        <div className="mt-3 font-semibold">Got it — thank you.</div>
        <p className="mt-1 text-sm text-muted-foreground">I read every message myself and usually reply within a day. If it is urgent, mail me at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-pink underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>.</p>
        <Button variant="outline" className="mt-4 h-10 w-full" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-4 gap-1">
        {KINDS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setKind(key)}
            aria-pressed={kind === key}
            className={cn("flex min-h-16 flex-col items-center justify-center gap-1 border px-1 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors", kind === key ? "border-pink bg-pink/10 text-pink" : "border-line text-muted-foreground hover:border-line-strong hover:text-foreground")}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      <Textarea
        autoFocus
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={4000}
        rows={5}
        placeholder={active.placeholder}
        className="min-h-28 rounded-none border-line bg-background text-sm"
      />
      {!isAuthenticated && (
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email (optional, so I can reply)" autoComplete="email" className="h-11 rounded-none border-line bg-background text-sm" />
      )}
      {error && <p className="border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}
      <Button className="h-11 w-full" disabled={busy || message.trim().length < 5} onClick={onSubmit}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send to the founder
      </Button>
      <p className="text-center font-mono text-[10px] text-muted-foreground">Goes straight to me. Current page and browser are attached, nothing else.</p>
    </div>
  );
}

// The panel as a modal: docked under the FAB, otherwise centered.
export function FeedbackPanel({ open, onClose, defaultKind, defaultMessage, docked = false }: { open: boolean; onClose: () => void; defaultKind?: FeedbackKind; defaultMessage?: string; docked?: boolean }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Send feedback"
        className={cn(
          "fixed z-50 w-[calc(100vw-2rem)] max-w-sm border border-line-strong bg-card shadow-[0_0_40px_rgb(0_0_0/0.6)]",
          docked ? "bottom-24 right-4 sm:bottom-24 sm:right-6" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="text-label">Feedback &amp; bug reports</div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <FeedbackForm defaultKind={defaultKind} defaultMessage={defaultMessage} onClose={onClose} />
      </div>
    </>
  );
}

// Floating action button, bottom right. Mounted once per layout.
export function FeedbackFab({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); track("feedback_opened", { surface: "fab" }); }}
        aria-label="Send feedback or report a bug"
        className={cn(
          "fixed bottom-6 right-4 z-40 flex h-12 items-center gap-2 border border-pink bg-pink px-3.5 text-sm font-medium text-white shadow-[0_0_24px_var(--pink-glow)] transition-colors hover:bg-pink/85 sm:right-6",
          className,
        )}
      >
        <MessageSquarePlus className="size-5" />
        <span className="hidden sm:inline">Feedback</span>
      </button>
      <FeedbackPanel open={open} onClose={() => setOpen(false)} docked />
    </>
  );
}

// Explicit "I am here to help" block for onboarding and project creation, where a silent failure loses a founder.
export function HelpCallout({ surface, title = "Stuck? Something broken?", children, className }: { surface: string; title?: string; children?: ReactNode; className?: string }) {
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const openWith = (k: FeedbackKind) => { setKind(k); track("feedback_opened", { surface }); };
  return (
    <div className={cn("border border-pink/40 bg-pink/5 p-4", className)}>
      <div className="text-label text-pink">{title}</div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {children ?? <>UserTrack is built by one founder. If a step does not work, an integration refuses to connect or anything is confusing — tell me right here. I read every message and usually reply the same day.</>}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button className="h-10" onClick={() => openWith("bug")}><Bug className="size-4" /> Report a problem</Button>
        <Button variant="outline" className="h-10" onClick={() => openWith("question")}><LifeBuoy className="size-4" /> Ask for help</Button>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex h-10 items-center px-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">{SUPPORT_EMAIL}</a>
      </div>
      <FeedbackPanel open={kind !== null} onClose={() => setKind(null)} defaultKind={kind ?? "bug"} />
    </div>
  );
}

// Inline "report this" trigger, e.g. next to an integration error.
export function ReportProblemButton({ surface, defaultMessage, label = "Report this to the founder", className }: { surface: string; defaultMessage?: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); track("feedback_opened", { surface }); }}
        className={cn("inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-pink hover:underline", className)}
      >
        <LifeBuoy className="size-3.5" /> {label}
      </button>
      <FeedbackPanel open={open} onClose={() => setOpen(false)} defaultKind="bug" defaultMessage={defaultMessage} />
    </>
  );
}
