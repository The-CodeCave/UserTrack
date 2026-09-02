"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Snippet } from "@/lib/mcp/snippets";
import { cn } from "@/lib/utils";

// Tabbed config snippets (one per MCP client) with a copy button.
export function SnippetTabs({ snippets }: { snippets: Snippet[] }) {
  const [id, setId] = useState(snippets[0]?.id);
  const [copied, setCopied] = useState(false);
  const active = snippets.find((s) => s.id === id) ?? snippets[0];
  if (!active) return null;
  return (
    <div>
      <div className="flex overflow-x-auto border border-line">
        {snippets.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setId(s.id); setCopied(false); }}
            className={cn("shrink-0 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", s.id === active.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 border border-t-0 border-line bg-background p-3">
        <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] leading-relaxed">{active.text}</pre>
        <button
          type="button"
          onClick={async () => { await navigator.clipboard.writeText(active.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${active.label} configuration`}
        >
          {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
        </button>
      </div>
      {active.hint && <div className="mt-2 text-xs text-muted-foreground">{active.hint}</div>}
    </div>
  );
}
