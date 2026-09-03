"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Panel } from "@/components/blueprint/panel";
import { badgeSrc, hasWindow, Seg, Snippet, TYPES, type BadgeKind, type Win } from "@/components/public/embed-badge";
import { widgetHasWindow, widgetSnippets, type WidgetTheme, type WidgetType } from "@/lib/embed";
import { formatDate, timeAgo } from "@/lib/format";
import { SITE_URL, saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="space-y-1"><div className="text-label">{label}</div>{children}</div>;
const WIN = [{ key: "7d", label: "7d" }, { key: "30d", label: "30d" }] as const;
const WIDGETS = [{ key: "users", label: "Live user count" }, { key: "growth", label: "Growth %" }, { key: "verified", label: "Verified by UserTrack" }, { key: "chart", label: "Mini chart" }] as const;
export interface EmbedSite { host: string; loads: number; firstSeenAt: number; lastSeenAt: number }

// Full embed configurator: live iframe widget (script / iframe snippets) or SVG badge (HTML / Markdown), plus where it is embedded.
export function EmbedConfigurator({ slug, name, isPublic, embedSites }: { slug: string; name: string; isPublic: boolean; embedSites: EmbedSite[] }) {
  const [format, setFormat] = useState<"widget" | "badge">("widget");
  return (
    <div className="space-y-4">
      {!isPublic && <Panel className="border-line-strong p-4 text-sm"><span className="font-medium">This SaaS is a draft.</span> <span className="text-muted-foreground">Widgets and badges render “not found” until you publish the page.</span></Panel>}
      <Seg value={format} options={[{ key: "widget", label: "Live widget" }, { key: "badge", label: "SVG badge" }] as const} onChange={setFormat} />
      {format === "widget" ? <WidgetConfigurator slug={slug} name={name} /> : <BadgeConfigurator slug={slug} name={name} />}
      <EmbedSites sites={embedSites} />
    </div>
  );
}

function WidgetConfigurator({ slug, name }: { slug: string; name: string }) {
  const [type, setType] = useState<WidgetType>("users");
  const [win, setWin] = useState<Win>("30d");
  const [theme, setTheme] = useState<WidgetTheme>("auto");
  const s = widgetSnippets({ siteUrl: SITE_URL, slug, name, type, theme, window: win });
  return (
    <>
      <Panel className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-4">
          <Field label="Widget"><Seg value={type} options={WIDGETS} onChange={setType} /></Field>
          {widgetHasWindow(type) && <Field label="Timeframe"><Seg value={win} options={WIN} onChange={setWin} /></Field>}
          <Field label="Theme"><Seg value={theme} options={[{ key: "auto", label: "auto" }, { key: "dark", label: "dark" }, { key: "light", label: "light" }] as const} onChange={setTheme} /></Field>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">Renders live from your public metrics, refreshes every 5 minutes and links back to your growth page. {theme === "auto" ? "Auto follows the visitor's system theme." : ""} UserTrack branding is always shown.</p>
        <div className={cn("flex items-center justify-center overflow-x-auto border border-line p-6", theme === "light" ? "bg-white" : "bg-background")}>
          <WidgetPreview key={s.iframeSrc} src={s.iframeSrc} width={s.width} height={s.height} title={`${name} on UserTrack`} />
        </div>
      </Panel>
      <Panel className="space-y-4 p-4 sm:p-5">
        <Snippet label="Script (recommended)" text={s.script} onCopy={() => track("embed_snippet_copied", { widget: type })} />
        <Snippet label="iframe" text={s.iframe} onCopy={() => track("embed_snippet_copied", { widget: type })} />
        <Snippet label="JSON" text={s.jsonUrl} onCopy={() => track("embed_snippet_copied", { widget: type })} />
      </Panel>
    </>
  );
}

// Mirrors public/widget.js: the iframe reports its rendered size via postMessage. Remounted (key) per src.
function WidgetPreview({ src, width, height, title }: { src: string; width: number; height: number; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ width, height });
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.data?.ut !== "size") return;
      setSize({ width: e.data.w, height: e.data.h });
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  return <iframe ref={ref} src={src} title={title} width={size.width} height={size.height} scrolling="no" className="max-w-full" style={{ border: 0, overflow: "hidden" }} />;
}

function BadgeConfigurator({ slug, name }: { slug: string; name: string }) {
  const [type, setType] = useState<BadgeKind>("users");
  const [win, setWin] = useState<Win>("30d");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [compact, setCompact] = useState(false);
  const { src, height } = badgeSrc({ slug, type, theme, window: win, compact });
  const page = saasUrl(slug);
  const html = `<a href="${page}"><img src="${src}" alt="${name} on UserTrack" height="${height}"></a>`;
  const md = `[![${name} on UserTrack](${src})](${page})`;
  return (
    <>
      <Panel className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-4">
          <Field label="Badge"><Seg value={type} options={TYPES} onChange={setType} /></Field>
          {hasWindow(type) && <Field label="Timeframe"><Seg value={win} options={WIN} onChange={setWin} /></Field>}
          <Field label="Theme"><Seg value={theme} options={[{ key: "dark", label: "dark" }, { key: "light", label: "light" }] as const} onChange={setTheme} /></Field>
          <Field label="Size"><Seg value={compact ? "compact" : "full"} options={[{ key: "full", label: "full" }, { key: "compact", label: "compact" }] as const} onChange={(v) => setCompact(v === "compact")} /></Field>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">Static SVG for READMEs and places that block scripts. Cached 1h. UserTrack branding is always shown — compact drops the word, never the logo.</p>
        <div className={cn("flex items-center justify-center overflow-x-auto border border-line p-6", theme === "light" ? "bg-white" : "bg-background")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} src={src} alt={`${name} on UserTrack`} height={height} className="max-w-none" />
        </div>
      </Panel>
      <Panel className="space-y-4 p-4 sm:p-5">
        <Snippet label="HTML" text={html} onCopy={() => track("badge_snippet_copied")} />
        <Snippet label="Markdown" text={md} onCopy={() => track("badge_snippet_copied")} />
        <Snippet label="Image URL" text={src} onCopy={() => track("badge_snippet_copied")} />
      </Panel>
    </>
  );
}

function EmbedSites({ sites }: { sites: EmbedSite[] }) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Where it&apos;s embedded</div>
        <span className="font-mono text-[11px] text-muted-foreground">{sites.length} {sites.length === 1 ? "site" : "sites"}</span>
      </div>
      {sites.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No embeds detected yet. Hosts show up here after the first load of a widget on another site — only the domain is stored, never visitors. Your own domain and localhost are ignored.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {sites.map((s) => (
            <li key={s.host} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <a href={`https://${s.host}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-pink">{s.host} <ExternalLink className="size-3" /></a>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{s.loads.toLocaleString("en")} {s.loads === 1 ? "load" : "loads"} · since {formatDate(s.firstSeenAt)} · last {timeAgo(s.lastSeenAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
