"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Check, Copy, Download, ImageIcon, Loader2, Share2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { track as analytics } from "@/lib/analytics";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CARD_RANGE_LABEL, CARD_RANGES, CARD_STYLE_META, CARD_STYLES, DEFAULT_CARD, cardImageUrl, fileName, verificationLine, type CardConfig, type CardStyle } from "@/lib/share-card";
import { xIntentUrl } from "@/lib/social";
import { attributedUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export interface StudioTarget {
  /** Public page the card belongs to (share page or founder profile). The PNG lives at `${page}/card`. */
  page: string;
  slug: string;
  kind: string;
  label: string;
  trust: "verified" | "unverified" | "pending";
  /** Whether the headline is a time series (shows the range picker). */
  graph?: boolean;
  /** Prefilled X post text (without the URL). */
  text: string;
  shareEventId?: Id<"shareEvents">;
  initial?: Partial<CardConfig>;
}

const SWATCH: Record<CardStyle, string> = {
  blueprint: "linear-gradient(135deg,#0b0c0e 0%,#1a1b1f 55%,rgba(251,1,132,0.55) 100%)",
  aurora: "linear-gradient(135deg,#150a1f 0%,rgba(251,1,132,0.7) 45%,rgba(96,165,250,0.7) 100%)",
  minimal: "linear-gradient(135deg,#0a0b0d 0%,#16171a 100%)",
};

export function ShareStudio({ target, open, onOpenChange }: { target: StudioTarget; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [cfg, setCfg] = useState<CardConfig>({ ...DEFAULT_CARD, ...target.initial });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const track = useMutation(api.share.track);
  const markShared = useMutation(api.share.markShared);
  const image = useMemo(() => cardImageUrl(target.page, cfg), [target.page, cfg]);
  const canCopyImage = typeof window !== "undefined" && typeof ClipboardItem !== "undefined" && Boolean(navigator.clipboard?.write);

  const loaded = loadedFor === image;
  // Milestone / spike / benchmark cards are statements, not series — no chart to toggle.
  const hasChart = target.graph || !/^(milestone|spike|benchmark)/.test(target.kind);
  useEffect(() => {
    if (!open) return;
    analytics("share_card_viewed", { kind: target.kind });
    void track({ kind: target.kind, action: "generated" }).catch(() => {});
  }, [open, target.kind, track]);

  const set = <K extends keyof CardConfig>(k: K, v: CardConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const flash = (k: string) => { setDone(k); setTimeout(() => setDone(null), 1600); };
  const shared = () => { if (target.shareEventId) void markShared({ id: target.shareEventId }).catch(() => {}); };

  async function blob() {
    const r = await fetch(image, { cache: "force-cache" });
    if (!r.ok) throw new Error(r.status === 429 ? "Too many renders — wait a moment" : "Could not render the card");
    return r.blob();
  }
  async function download() {
    setBusy("download");
    try {
      const b = await blob();
      const url = URL.createObjectURL(b);
      const a = Object.assign(document.createElement("a"), { href: url, download: fileName(target.slug, target.kind, cfg) });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      void track({ kind: target.kind, action: "downloaded" });
      analytics("share_card_downloaded", { kind: target.kind, range: String(cfg.range) });
      shared();
      flash("download");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function copyImage() {
    setBusy("image");
    try {
      const b = await blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
      void track({ kind: target.kind, action: "copied_image" });
      flash("image");
      toast.success("Image copied");
    } catch {
      toast.message("Clipboard blocked the image — downloading instead");
      await download();
    } finally {
      setBusy(null);
    }
  }
  // Outbound links are attributed per channel; the preview / canonical `target.page` stays clean.
  const outbound = (channel: string) => attributedUrl(target.page, { ref: "share", source: channel, medium: "share-card", campaign: target.kind });
  async function copyLink() {
    await navigator.clipboard.writeText(outbound("link"));
    void track({ kind: target.kind, action: "copied_link" });
    flash("link");
  }
  function postToX() {
    void track({ kind: target.kind, action: "x_intent" });
    analytics("share_intent_opened", { network: "x" });
    shared();
    window.open(xIntentUrl(target.text, outbound("x")), "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] w-full max-w-[100vw] gap-0 overflow-y-auto rounded-none border border-line bg-background p-0 sm:max-h-[92vh] sm:max-w-5xl sm:rounded-lg">
        <DialogHeader className="border-b border-line px-4 py-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-sm"><Share2 className="size-4 text-pink" /> Share card · {target.label}</DialogTitle>
          <DialogDescription className="text-xs">Deterministic PNG rendered server-side from your live numbers. {verificationLine(target.trust)}.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[1.45fr_1fr]">
          <div className="bp-grid relative flex items-center justify-center border-b border-line p-4 lg:border-b-0 lg:border-r lg:p-6">
            <div className={cn("relative w-full overflow-hidden border border-line bg-card shadow-2xl", cfg.size === "square" ? "mx-auto aspect-square max-w-[520px]" : "aspect-[1200/630]")}>
              {!loaded && <div className="absolute inset-0 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.img key={image} src={image} alt="Share card preview" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: loaded ? 1 : 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} onLoad={() => setLoadedFor(image)} className="absolute inset-0 size-full object-cover" />
              </AnimatePresence>
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-5">
            <Group label="Style">
              <div className="grid grid-cols-3 gap-2">
                {CARD_STYLES.map((s) => (
                  <button key={s} type="button" onClick={() => set("style", s)} aria-pressed={cfg.style === s} className={cn("group flex min-h-[64px] flex-col items-start justify-end border p-2 text-left transition-colors", cfg.style === s ? "border-pink" : "border-line hover:border-line-strong")}>
                    <span className="mb-2 block h-5 w-full border border-line" style={{ background: SWATCH[s] }} />
                    <span className="text-xs font-medium">{CARD_STYLE_META[s].label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{CARD_STYLE_META[cfg.style].blurb}</p>
            </Group>

            <Group label="Format">
              <Segmented value={cfg.size} onChange={(v) => set("size", v)} options={[{ v: "og" as const, label: "1200 × 630" }, { v: "square" as const, label: "1080 × 1080" }]} />
            </Group>

            {target.graph && (
              <Group label="Timeframe">
                <Segmented value={cfg.range} onChange={(v) => set("range", v)} options={CARD_RANGES.map((r) => ({ v: r, label: r.toUpperCase() }))} />
                <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{CARD_RANGE_LABEL[cfg.range]} · the chart keeps its real scale and prints min / max.</p>
              </Group>
            )}

            <Group label="Show">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {hasChart && <Toggle label="Chart" checked={cfg.chart} onChange={(v) => set("chart", v)} />}
                <Toggle label="Logo" checked={cfg.logo} onChange={(v) => set("logo", v)} />
                <Toggle label="Founder handle" checked={cfg.founder} onChange={(v) => set("founder", v)} />
                <Toggle label={target.trust === "verified" ? "Verified by UserTrack" : "UserTrack line"} checked={cfg.verified} onChange={(v) => set("verified", v)} />
                <Toggle label="Date range" checked={cfg.dates} onChange={(v) => set("dates", v)} />
              </div>
            </Group>

            <Group label="Title (optional)">
              <Input value={cfg.title ?? ""} maxLength={60} placeholder="Overrides the small label above the number" onChange={(e) => set("title", e.target.value || undefined)} className="h-10 bg-background" />
            </Group>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line bg-background/95 px-4 py-3 backdrop-blur sm:px-5">
          <Button onClick={download} disabled={busy !== null} className="h-10 flex-1 sm:flex-none">
            {busy === "download" ? <Loader2 className="size-4 animate-spin" /> : done === "download" ? <Check className="size-4" /> : <Download className="size-4" />} Download PNG
          </Button>
          {canCopyImage && (
            <Button variant="outline" onClick={copyImage} disabled={busy !== null} className="h-10 flex-1 sm:flex-none">
              {busy === "image" ? <Loader2 className="size-4 animate-spin" /> : done === "image" ? <Check className="size-4 text-pink" /> : <ImageIcon className="size-4" />} Copy image
            </Button>
          )}
          <Button variant="outline" onClick={copyLink} className="h-10 flex-1 sm:flex-none">
            {done === "link" ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />} Copy link
          </Button>
          <Button variant="outline" onClick={postToX} className="h-10 flex-1 sm:ml-auto sm:flex-none">
            <span className="font-semibold">𝕏</span> Post to X
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-label mb-2">{label}</div>{children}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[32px] cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap border border-line">
      {options.map((o) => (
        <button key={o.v} role="tab" type="button" aria-selected={value === o.v} onClick={() => onChange(o.v)} className={cn("min-h-[36px] flex-1 px-3 font-mono text-[11px] uppercase tracking-wider transition-colors", value === o.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{o.label}</button>
      ))}
    </div>
  );
}
