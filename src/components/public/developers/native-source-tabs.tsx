"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import { NATIVE_SOURCE_LABEL, NATIVE_SOURCES, type NativeSource, PACKAGE_MANAGERS, SOURCE_FILES, installCommands } from "@convex/lib/nativeSetup";
import { cn } from "@/lib/utils";

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 border border-line bg-background p-3">
      <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] leading-relaxed text-foreground/90">{text}</pre>
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy snippet">
        {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

const subscribeHash = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const readHash = () => window.location.hash.replace("#", "");

// Per-source install + code tabs for /developers/integrations/native. The hash (#prisma) preselects a tab.
export function NativeSourceTabs() {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const [picked, setPicked] = useState<NativeSource | null>(null);
  const source: NativeSource = picked ?? ((NATIVE_SOURCES as readonly string[]).includes(hash) ? (hash as NativeSource) : "prisma");
  const setSource = (s: NativeSource) => setPicked(s);
  const [pm, setPm] = useState<(typeof PACKAGE_MANAGERS)[number]>("npm");
  const files = SOURCE_FILES[source];
  return (
    <div>
      <div className="flex overflow-x-auto border border-line" role="tablist" aria-label="SDK adapter">
        {NATIVE_SOURCES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => { setSource(s); history.replaceState(null, "", `#${s}`); }} className={cn("shrink-0 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", s === source ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
            {NATIVE_SOURCE_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="space-y-5 border border-t-0 border-line p-4">
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-label">
            <span>1 · Install</span>
            <span className="flex gap-1">{PACKAGE_MANAGERS.map((p) => <button key={p} type="button" onClick={() => setPm(p)} className={cn("px-2 py-0.5 font-mono text-[10px] uppercase", p === pm ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{p}</button>)}</span>
          </div>
          <Code text={installCommands(source)[pm]} />
        </div>
        <div>
          <div className="mb-1 text-label">2 · {files.route.title} <span className="normal-case tracking-normal text-muted-foreground">· {files.route.path}</span></div>
          <Code text={files.route.code} />
        </div>
        {files.push && (
          <div>
            <div className="mb-1 text-label">Optional · {files.push.title} <span className="normal-case tracking-normal text-muted-foreground">· {files.push.path}</span></div>
            <Code text={files.push.code} />
          </div>
        )}
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {files.notes.map((n) => <li key={n} className="flex gap-2"><span className="font-mono text-pink">›</span><span>{n}</span></li>)}
        </ul>
      </div>
    </div>
  );
}
