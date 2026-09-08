"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { track } from "@/lib/analytics";
import { attributedUrl, badgeUrl, saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";
import { CopyForAgent } from "@/components/site/copy-for-agent";
import { badgeAgentPrompt } from "@/lib/llm-prompts";

export const TYPES = [
  { key: "users", label: "Users" },
  { key: "growth", label: "Growth" },
  { key: "trending", label: "Trending rank" },
  { key: "verified", label: "Verified" },
  { key: "chart", label: "Mini chart" },
] as const;
export type BadgeKind = (typeof TYPES)[number]["key"];
export type Win = "7d" | "30d";
export const hasWindow = (type: BadgeKind) => type === "growth" || type === "chart";

// Badge image URL + rendered height for a given configuration (mirrors /api/badge/[slug]).
export function badgeSrc(o: { slug: string; type: BadgeKind; theme: "dark" | "light"; window?: Win; compact?: boolean }) {
  const src = `${badgeUrl(o.slug, o.type)}${o.theme === "light" ? "&theme=light" : ""}${hasWindow(o.type) && o.window === "7d" ? "&window=7d" : ""}${o.compact ? "&compact=1" : ""}`;
  return { src, height: o.type === "chart" ? (o.compact ? 96 : 120) : 28 };
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: readonly { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap border border-line">
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", value === o.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{o.label}</button>
      ))}
    </div>
  );
}

// Copy-paste embed UI. The badge itself is served by /api/badge/[slug].svg and cached at the edge.
export function EmbedBadge({ slug, name, manageHref }: { slug: string; name: string; manageHref?: string }) {
  const [type, setType] = useState<BadgeKind>("users");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [win, setWin] = useState<Win>("30d");
  const { src, height } = badgeSrc({ slug, type, theme, window: win });
  const page = attributedUrl(saasUrl(slug), { ref: "badge", source: "badge", medium: "image", campaign: type });
  const html = `<a href="${page}"><img src="${src}" alt="${name} on UserTrack" height="${height}"></a>`;
  const md = `[![${name} on UserTrack](${src})](${page})`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={type} options={TYPES} onChange={setType} />
        {hasWindow(type) && <Seg value={win} options={[{ key: "7d", label: "7d" }, { key: "30d", label: "30d" }] as const} onChange={setWin} />}
        <Seg value={theme} options={[{ key: "dark", label: "dark" }, { key: "light", label: "light" }] as const} onChange={setTheme} />
        {manageHref && <Link href={manageHref} className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-pink">Full configurator →</Link>}
      </div>
      <div className={cn("flex items-center justify-center overflow-x-auto border border-line p-6", theme === "light" ? "bg-white" : "bg-background")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${name} on UserTrack`} height={height} className="max-w-none" />
      </div>
      <CopyForAgent surface="public-badge" prompt={badgeAgentPrompt({ name, slug, kind: type, height, html, markdown: md, imageUrl: src, pageUrl: page })} className="border border-pink/30 bg-pink/5 p-3" hint="Paste into Claude Code, Cursor or Codex — it finds the right file and adds the badge." />
      <Snippet label="HTML" text={html} onCopy={() => track("badge_snippet_copied")} />
      <Snippet label="Markdown" text={md} onCopy={() => track("badge_snippet_copied")} />
    </div>
  );
}

export function Snippet({ label, text, onCopy }: { label: string; text: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-label">{label}</div>
      <div className="flex items-start gap-2 border border-line bg-background p-3">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed">{text}</code>
        <button
          onClick={async () => { await navigator.clipboard.writeText(text); onCopy?.(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
