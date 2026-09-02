"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export const errMsg = (err: unknown) => (err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0];

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      aria-label={`Copy ${label}`}
      className={cn("flex size-10 shrink-0 items-center justify-center border border-line text-muted-foreground transition-colors hover:border-line-strong hover:text-foreground", className)}
    >
      {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
    </button>
  );
}

export function CopyBlock({ label, text, hint }: { label?: string; text: string; hint?: string }) {
  return (
    <div>
      {label && <div className="mb-1 text-label">{label}</div>}
      <div className="flex items-start gap-2 border border-line bg-background p-3">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed">{text}</code>
        <CopyButton text={text} label={label ?? "snippet"} />
      </div>
      {hint && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Shown exactly once after creation; the backend never returns the secret again.
export function SecretReveal({ secret }: { secret: string }) {
  return (
    <div className="border border-pink/40 bg-pink/5 p-3">
      <div className="flex items-start gap-2 text-xs text-pink"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />This key will only be shown once. Store it somewhere safe.</div>
      <div className="mt-2 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-sm leading-relaxed">{secret}</code>
        <CopyButton text={secret} label="secret" className="border-pink/40" />
      </div>
    </div>
  );
}
