"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { badgeUrl, saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

const TYPES = [
  { key: "users", label: "Users" },
  { key: "growth", label: "30-day growth" },
  { key: "trending", label: "Trending rank" },
  { key: "verified", label: "Verified" },
];

// Copy-paste embed UI. The badge itself is served by /api/badge/[slug].svg and cached at the edge.
export function EmbedBadge({ slug, name }: { slug: string; name: string }) {
  const [type, setType] = useState("users");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const src = `${badgeUrl(slug, type)}${theme === "light" ? "&theme=light" : ""}`;
  const page = saasUrl(slug);
  const html = `<a href="${page}"><img src="${src}" alt="${name} on UserTrack" height="28"></a>`;
  const md = `[![${name} on UserTrack](${src})](${page})`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-line">
          {TYPES.map((t) => (
            <button key={t.key} onClick={() => setType(t.key)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", type === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{t.label}</button>
          ))}
        </div>
        <div className="flex border border-line">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", theme === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{t}</button>
          ))}
        </div>
      </div>
      <div className={cn("flex items-center justify-center border border-line p-6", theme === "light" ? "bg-white" : "bg-background")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${name} on UserTrack`} height={28} />
      </div>
      <Snippet label="HTML" text={html} />
      <Snippet label="Markdown" text={md} />
    </div>
  );
}

export function Snippet({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-label">{label}</div>
      <div className="flex items-start gap-2 border border-line bg-background p-3">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed">{text}</code>
        <button
          onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
