"use client";

import { useState } from "react";
import { Panel } from "@/components/blueprint/panel";
import { badgeSrc, hasWindow, Seg, Snippet, TYPES, type BadgeKind, type Win } from "@/components/public/embed-badge";
import { saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="space-y-1"><div className="text-label">{label}</div>{children}</div>;

// Full badge configurator: type, window, theme, size, live preview and copyable snippets.
export function EmbedConfigurator({ slug, name, isPublic }: { slug: string; name: string; isPublic: boolean }) {
  const [type, setType] = useState<BadgeKind>("users");
  const [win, setWin] = useState<Win>("30d");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [compact, setCompact] = useState(false);
  const { src, height } = badgeSrc({ slug, type, theme, window: win, compact });
  const page = saasUrl(slug);
  const html = `<a href="${page}"><img src="${src}" alt="${name} on UserTrack" height="${height}"></a>`;
  const md = `[![${name} on UserTrack](${src})](${page})`;
  return (
    <div className="space-y-4">
      {!isPublic && <Panel className="border-line-strong p-4 text-sm"><span className="font-medium">This SaaS is a draft.</span> <span className="text-muted-foreground">Badges render “not found” until you publish the page.</span></Panel>}
      <Panel className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-4">
          <Field label="Badge"><Seg value={type} options={TYPES} onChange={setType} /></Field>
          {hasWindow(type) && <Field label="Timeframe"><Seg value={win} options={[{ key: "7d", label: "7d" }, { key: "30d", label: "30d" }] as const} onChange={setWin} /></Field>}
          <Field label="Theme"><Seg value={theme} options={[{ key: "dark", label: "dark" }, { key: "light", label: "light" }] as const} onChange={setTheme} /></Field>
          <Field label="Size"><Seg value={compact ? "compact" : "full"} options={[{ key: "full", label: "full" }, { key: "compact", label: "compact" }] as const} onChange={(v) => setCompact(v === "compact")} /></Field>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">UserTrack branding is always shown — the mark is what makes the number credible. Compact drops the word, never the logo.</p>
        <div className={cn("flex items-center justify-center overflow-x-auto border border-line p-6", theme === "light" ? "bg-white" : "bg-background")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} src={src} alt={`${name} on UserTrack`} height={height} className="max-w-none" />
        </div>
      </Panel>
      <Panel className="space-y-4 p-4 sm:p-5">
        <Snippet label="HTML" text={html} />
        <Snippet label="Markdown" text={md} />
        <Snippet label="Image URL" text={src} />
      </Panel>
    </div>
  );
}
