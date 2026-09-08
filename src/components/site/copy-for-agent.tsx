"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

// Pink one-click "hand this to your coding agent" button. `prompt` is built by src/lib/llm-prompts.ts.
export function CopyForAgent({ prompt, surface, label = "Copy for AI agent", hint, className }: { prompt: string; surface: string; label?: string; hint?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(prompt);
    track("llm_prompt_copied", { surface });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-10 shrink-0 items-center gap-2 border border-pink bg-pink px-3.5 text-sm font-medium text-white transition-colors hover:bg-pink/85"
      >
        {copied ? <Check className="size-4" /> : <Sparkles className="size-4" />}
        {copied ? "Copied — paste it into your agent" : label}
      </button>
      <span className="font-mono text-[11px] text-muted-foreground">{hint ?? "Full instructions for Claude Code, Cursor or Codex — it does the wiring for you."}</span>
    </div>
  );
}
