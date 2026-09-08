"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles, Trash2, Upload, Link2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { SaasLogo } from "@/components/public/saas-card";
import { StackIcon } from "@/components/public/stack-chip";
import { ComboSelect } from "@/components/app/combo-select";
import { CATEGORIES } from "@/lib/categories";
import { COUNTRIES, countryFlag } from "@/lib/countries";
import { FUNDING, MARKETING_CHANNELS, MARKETS, PROFILE_LIMITS, TEAM_SIZES, type Funding, type TeamSize } from "@/lib/profile-options";
import { TECH_STACK, TECH_STACK_MAX, normalizeStackEntry } from "@/lib/tech-stack";
import { xHandleError } from "@/lib/social";
import { cn } from "@/lib/utils";
import type { SiteImport } from "@convex/enrich";
import type { PreviewDraft } from "@/lib/preview-draft";
import type { PlatformValue } from "./platform-picker";
import { TrustmrrImport, type ImportResult, type PrefillKey } from "./trustmrr-import";

type Cofounder = { name: string; x: string; github: string };
// Uncontrolled inputs; their current values are captured before a TrustMRR prefill remounts the form with new defaults.
const TEXT_KEYS = ["name", "description", "websiteUrl", "category", "tags", "foundedAt", "valueProposition", "problemSolved", "audience", "pricingSummary", "additionalInfo", "slug", "appStoreUrl", "playStoreUrl"] as const;
const TEXT_PREFILL_KEYS = ["name", "description", "websiteUrl", "category", "foundedAt", "valueProposition", "problemSolved", "audience", "pricingSummary", "additionalInfo"] as const satisfies readonly PrefillKey[];
const LOGO_MAX = 1_048_576;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function SaasForm({
  initial,
  fromPreview,
  platform,
  submitLabel = "Save",
  onSaved,
}: {
  initial?: Doc<"saas"> | null;
  fromPreview?: PreviewDraft | null;
  platform?: PlatformValue;
  submitLabel?: string;
  onSaved?: (id: Id<"saas">) => void;
}) {
  // What the /preview reading of the founder's own site already answered. Applied to a new project only, and
  // highlighted like a TrustMRR import, so nothing arrives silently.
  const fromSite: Record<string, string | undefined> = initial || !fromPreview ? {} : { name: fromPreview.name, description: fromPreview.description, websiteUrl: fromPreview.url, valueProposition: fromPreview.valueProposition, category: fromPreview.category, logoUrl: fromPreview.logoUrl };
  const fromSiteCount = Object.values(fromSite).filter(Boolean).length;
  const create = useMutation(api.saas.create);
  const update = useMutation(api.saas.update);
  const uploadUrl = useMutation(api.saas.generateLogoUploadUrl);
  const inspectSite = useAction(api.enrich.site);
  const me = useQuery(api.profiles.me);
  const [saving, setSaving] = useState(false);
  const [markets, setMarkets] = useState<string[]>(initial?.markets ?? []);
  const [stack, setStack] = useState<string[]>(initial?.techStack ?? []);
  const [channels, setChannels] = useState<string[]>(initial?.marketingChannels ?? []);
  const [cofounders, setCofounders] = useState<Cofounder[]>((initial?.cofounders ?? []).map((c) => ({ name: c.name ?? "", x: c.x ?? "", github: c.github ?? "" })));
  const [country, setCountry] = useState(initial?.country ?? "");
  const [funding, setFunding] = useState<Funding | "">(initial?.funding ?? "");
  const [teamSize, setTeamSize] = useState<TeamSize | "">(initial?.teamSize ?? "");
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [hideFromSearch, setHideFromSearch] = useState(initial?.hideFromSearch ?? false);
  const [mobile, setMobile] = useState(initial?.projectType === "mobile" || initial?.projectType === "hybrid");
  const [logo, setLogo] = useState<{ url?: string; storageId?: Id<"_storage">; preview?: string }>({ url: initial?.logoUrl ?? fromSite.logoUrl });
  const [logoMode, setLogoMode] = useState<"upload" | "url">((initial?.logoUrl && !initial.logoStorageId) || fromSite.logoUrl ? "url" : "upload");
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<string | null>(fromSiteCount ? `${fromSiteCount} field${fromSiteCount === 1 ? "" : "s"} filled from your website — change anything before you save` : null);
  const autoScanned = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [defaults, setDefaults] = useState<Record<string, string | undefined>>(() => ({
    name: initial?.name ?? fromSite.name, description: initial?.description ?? fromSite.description, websiteUrl: initial?.websiteUrl ?? fromSite.websiteUrl, category: initial?.category ?? fromSite.category ?? "", tags: initial?.tags.join(", "),
    foundedAt: initial?.foundedAt ? monthValue(initial.foundedAt) : undefined, valueProposition: initial?.valueProposition ?? fromSite.valueProposition, problemSolved: initial?.problemSolved,
    audience: initial?.audience, pricingSummary: initial?.pricingSummary, additionalInfo: initial?.additionalInfo, slug: initial?.slug, appStoreUrl: initial?.appStoreUrl, playStoreUrl: initial?.playStoreUrl,
  }));
  const [formKey, setFormKey] = useState(0);
  const [highlight, setHighlight] = useState<Set<string>>(() => new Set(Object.entries(fromSite).filter(([, v]) => v).map(([k]) => k)));
  const [trustmrrSlug, setTrustmrrSlug] = useState(initial?.trustmrrSlug ?? "");
  const hl = (k: string) => (highlight.has(k) ? "ring-2 ring-pink/60" : "");

  const currentText = () => { const fd = formRef.current ? new FormData(formRef.current) : null; return (k: string) => String(fd?.get(k) ?? "").trim(); };
  function filledKeys() {
    const cur = currentText();
    const set = new Set<PrefillKey>();
    for (const k of TEXT_PREFILL_KEYS) if (cur(k)) set.add(k);
    if (markets.length) set.add("markets");
    if (stack.length) set.add("techStack");
    if (channels.length) set.add("marketingChannels");
    if (cofounders.some((c) => c.name || c.x || c.github)) set.add("cofounders");
    if (country) set.add("country");
    if (funding) set.add("funding");
    if (teamSize) set.add("teamSize");
    if (logo.url || logo.storageId) set.add("logoUrl");
    if (mobile || !(initial && !platform)) set.add("projectType");
    return set;
  }
  // Fills empty fields (all of them with overwrite), highlights what changed, links the slug; nothing is saved until submit.
  function applyPrefill({ prefill, source }: ImportResult, overwrite: boolean) {
    const cur = currentText();
    const next: Record<string, string | undefined> = { ...defaults };
    for (const k of TEXT_KEYS) next[k] = cur(k);
    const filled = filledKeys();
    const hit = new Set<string>();
    const take = (k: PrefillKey) => { const ok = prefill[k] !== undefined && (overwrite || !filled.has(k)); if (ok) hit.add(k); return ok; };
    for (const k of TEXT_PREFILL_KEYS) if (take(k)) next[k] = k === "foundedAt" ? monthValue(prefill.foundedAt!) : String(prefill[k]);
    if (take("markets")) setMarkets(prefill.markets!);
    if (take("techStack")) setStack(prefill.techStack!);
    if (take("marketingChannels")) setChannels(prefill.marketingChannels!);
    if (take("cofounders")) setCofounders(prefill.cofounders!.map((c) => ({ name: c.name ?? "", x: c.x ?? "", github: "" })));
    if (take("country")) setCountry(prefill.country!);
    if (take("funding")) setFunding(prefill.funding!);
    if (take("teamSize")) setTeamSize(prefill.teamSize!);
    if (take("logoUrl")) { setLogo({ url: prefill.logoUrl }); setLogoMode("url"); }
    if (take("projectType")) setMobile(true);
    setTrustmrrSlug(source.slug);
    setDefaults(next);
    setHighlight(hit);
    setFormKey((k) => k + 1);
    toast.success(hit.size ? `${hit.size} field${hit.size === 1 ? "" : "s"} filled from TrustMRR — review and save` : "Nothing to fill: every field already has a value");
  }

  // Reads the public <head> of the founder's own site and fills whatever is still empty. Nothing is saved until submit.
  async function scanSite(raw: string, auto: boolean) {
    const url = raw.trim();
    if (!url || scanning) return;
    setScanning(true);
    try {
      const site: SiteImport = await inspectSite({ url });
      const cur = currentText();
      const next: Record<string, string | undefined> = { ...defaults };
      for (const k of TEXT_KEYS) next[k] = cur(k);
      const hit = new Set<string>();
      const take = (k: "name" | "description" | "valueProposition" | "websiteUrl", value?: string) => {
        if (!value || cur(k)) return;
        next[k] = value;
        hit.add(k);
      };
      take("websiteUrl", site.url);
      take("name", site.name);
      take("description", site.description);
      take("valueProposition", site.valueProposition);
      if (!logo.url && !logo.storageId && site.logoUrl) {
        setLogo({ storageId: site.logoStorageId, url: site.logoUrl });
        setLogoMode(site.logoStorageId ? "upload" : "url");
        hit.add("logoUrl");
      }
      setDefaults(next);
      setHighlight(hit);
      setFormKey((k) => k + 1);
      setScanned(hit.size ? `${hit.size} field${hit.size === 1 ? "" : "s"} filled from your site` : "Your site had nothing new to add");
      track("site_autofill", { fields: [...hit].join(","), auto });
      if (hit.size && !auto) toast.success("Filled from your website — review and save");
    } catch (e) {
      const msg = e instanceof ConvexError ? (e.data as { message?: string }).message : undefined;
      setScanned(null);
      if (!auto) toast.error(msg ?? "Could not read that website");
    } finally {
      setScanning(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > LOGO_MAX || !LOGO_TYPES.includes(f.type)) { toast.error("Logo must be a PNG, JPG or WebP up to 1 MB"); return; }
    setUploading(true);
    try {
      const res = await fetch(await uploadUrl(), { method: "POST", headers: { "Content-Type": f.type }, body: f });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setLogo({ storageId, preview: URL.createObjectURL(f) });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const opt = (k: string) => s(k) || undefined;
    if (cofounders.some((c) => xHandleError(c.x))) { toast.error("Check the cofounder X handles"); return; }
    const type = platform ?? (initial ? { projectType: mobile ? (initial.projectType === "hybrid" ? "hybrid" : "mobile") : "web", appStoreUrl: mobile ? opt("appStoreUrl") : undefined, playStoreUrl: mobile ? opt("playStoreUrl") : undefined } as PlatformValue : {});
    const data = {
      name: s("name"),
      websiteUrl: s("websiteUrl"),
      description: s("description"),
      logoUrl: logo.storageId ? undefined : logo.url || undefined,
      logoStorageId: logo.storageId,
      category: opt("category"),
      tags: s("tags").split(",").map((t) => t.trim()).filter(Boolean),
      foundedAt: parseMonth(s("foundedAt")),
      markets, techStack: stack, marketingChannels: channels,
      cofounders: cofounders.map((c) => ({ name: c.name.trim() || undefined, x: c.x.trim() || undefined, github: c.github.trim() || undefined })),
      country: country || undefined, funding: funding || undefined, teamSize: teamSize || undefined,
      valueProposition: opt("valueProposition"), problemSolved: opt("problemSolved"), audience: opt("audience"), pricingSummary: opt("pricingSummary"), additionalInfo: opt("additionalInfo"),
      anonymous, hideFromSearch,
      trustmrrSlug: trustmrrSlug || (initial?.trustmrrSlug ? "" : undefined),
      ...type,
    };
    setSaving(true);
    try {
      const id = initial ? (await update({ id: initial._id, slug: s("slug") || undefined, ...data }), initial._id) : await create(data);
      if (initial) track("project_updated", { fields: changedFields(initial, data) });
      else track("project_created", { source: "form" });
      toast.success(initial ? "Saved" : "SaaS created");
      onSaved?.(id);
    } catch (err) {
      toast.error(/Uncaught \w*Error: ([^\n]*)/.exec((err as Error).message)?.[1] ?? (err as Error).message.split("\n")[0]);
    } finally {
      setSaving(false);
    }
  }

  const founderX = me?.profile?.x;
  const editCofounder = (i: number, patch: Partial<Cofounder>) => setCofounders((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const logoSrc = logo.preview ?? logo.url;

  return (
    <form ref={formRef} key={formKey} onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-4">
        <TrustmrrImport label={<SectionLabel>Product</SectionLabel>} filled={filledKeys} onApply={applyPrefill} linkedSlug={trustmrrSlug || undefined} onUnlink={() => setTrustmrrSlug("")} />
        <div className="space-y-1.5">
          <Label htmlFor="websiteUrl" className="text-label">Website URL</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="websiteUrl" name="websiteUrl" defaultValue={defaults.websiteUrl} placeholder="https://acme.com" type="url" required
              className={cn("h-11 flex-1 bg-background", hl("websiteUrl"))}
              onBlur={(e) => { if (!initial && !autoScanned.current && e.target.value.trim() && !currentText()("name")) { autoScanned.current = true; void scanSite(e.target.value, true); } }} />
            <Button type="button" variant="outline" className="h-11 shrink-0 bg-background" disabled={scanning}
              onClick={() => { autoScanned.current = true; void scanSite(String(new FormData(formRef.current!).get("websiteUrl") ?? ""), false); }} data-testid="site-autofill">
              {scanning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {scanning ? "Reading…" : "Autofill"}
            </Button>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">{scanned ?? "Paste your live URL and we read the name, description and icon straight off the page."}</p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-start">
            <div className={hl("logoUrl")}><SaasLogo name={initial?.name ?? "?"} logoUrl={logoSrc} size={72} /></div>
            <div className="flex flex-wrap gap-1.5">
              <input ref={file} type="file" accept={LOGO_TYPES.join(",")} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="logo-file" />
              <Button type="button" size="sm" variant={logoMode === "upload" ? "default" : "outline"} disabled={uploading} onClick={() => { setLogoMode("upload"); file.current?.click(); }}>{uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload</Button>
              <Button type="button" size="sm" variant={logoMode === "url" ? "default" : "outline"} onClick={() => setLogoMode("url")}><Link2 className="size-3.5" /> Use URL</Button>
              {logoSrc && <Button type="button" size="sm" variant="ghost" onClick={() => setLogo({})}>Remove</Button>}
            </div>
            <p className="hidden font-mono text-[11px] text-muted-foreground sm:block">PNG, JPG or WebP · max 1 MB</p>
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            {logoMode === "url" && <Field label="Logo URL" name="logoUrl" value={logo.url ?? ""} onChange={(e) => setLogo({ url: e.target.value })} placeholder="https://acme.com/logo.png" type="url" />}
            <Limited label="Product name" name="name" max={PROFILE_LIMITS.name} defaultValue={defaults.name} placeholder="Acme Analytics" required minLength={2} className={hl("name")} />
            <Limited label="Description" name="description" max={PROFILE_LIMITS.description} defaultValue={defaults.description} placeholder="Product analytics for indie SaaS." required textarea rows={3} className={hl("description")} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="category" className="text-label">Category</Label>
            <select id="category" name="category" defaultValue={defaults.category} required className={cn("h-11 w-full border border-input bg-background px-3 text-sm", hl("category"))}>
              <option value="" disabled>Pick a category</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </div>
          <Field label="Tags (comma separated)" name="tags" defaultValue={defaults.tags} placeholder="analytics, devtools" />
        </div>
        {initial && !platform && (
          <div className="space-y-3">
            <Toggle label="My product is a mobile app" hint="Adds App Store / Google Play links and lists it on the mobile boards." checked={mobile} onChange={setMobile} className={hl("projectType")} />
            {mobile && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="App Store URL" name="appStoreUrl" defaultValue={defaults.appStoreUrl} placeholder="https://apps.apple.com/…" type="url" />
                <Field label="Google Play URL" name="playStoreUrl" defaultValue={defaults.playStoreUrl} placeholder="https://play.google.com/store/apps/…" type="url" />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className={cn(hl("markets"), "ring-offset-4 ring-offset-background")}><ComboSelect label="Markets" hint="Which spaces your product plays in." options={MARKETS} value={markets} onChange={setMarkets} max={PROFILE_LIMITS.markets} testId="markets-select" /></div>
        <div className={cn(hl("techStack"), "ring-offset-4 ring-offset-background")}><ComboSelect label="Tech stack" hint="Search the catalog; anything not in it is stored as plain text." options={TECH_STACK} value={stack} onChange={setStack} max={TECH_STACK_MAX} placeholder="Search frameworks, databases, hosting…" icon={(slug) => <StackIcon slug={slug} />} onCustom={normalizeStackEntry} testId="stack-select" /></div>
        <div className={cn(hl("marketingChannels"), "ring-offset-4 ring-offset-background")}><ComboSelect label="Marketing channels" hint="Where your users come from." options={MARKETING_CHANNELS} value={channels} onChange={setChannels} max={PROFILE_LIMITS.marketingChannels} testId="channels-select" /></div>
      </section>

      <section className={cn("space-y-3", hl("cofounders"), "ring-offset-4 ring-offset-background")}>
        <SectionLabel>Founders</SectionLabel>
        <div className="flex flex-wrap items-center justify-between gap-2 border border-line bg-background px-3 py-2 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Founder&apos;s X handle</span>
          <span className="font-mono text-sm">{founderX ? `@${founderX}` : <span className="text-muted-foreground">not set</span>}</span>
          <Link href="/app/profile" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{founderX ? "Edit in profile" : "Add in profile"}</Link>
        </div>
        {cofounders.map((c, i) => (
          <div key={i} className="grid gap-2 border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" data-testid="cofounder-row">
            <Field label="Name" name={`cofounder-name-${i}`} value={c.name} maxLength={PROFILE_LIMITS.cofounderName} onChange={(e) => editCofounder(i, { name: e.target.value })} placeholder="Ada Lovelace" />
            <Field label="X handle" name={`cofounder-x-${i}`} value={c.x} onChange={(e) => editCofounder(i, { x: e.target.value })} placeholder="@ada" aria-invalid={Boolean(xHandleError(c.x))} className="font-mono" />
            <Field label="GitHub" name={`cofounder-github-${i}`} value={c.github} onChange={(e) => editCofounder(i, { github: e.target.value })} placeholder="ada" className="font-mono" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove cofounder" className="justify-self-end" onClick={() => setCofounders((list) => list.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        {cofounders.length < PROFILE_LIMITS.cofounders && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCofounders((list) => [...list, { name: "", x: "", github: "" }])}><Plus className="size-3.5" /> Add cofounder</Button>
        )}
      </section>

      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionLabel>Company details</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="country" className="text-label">Country</Label>
            <select id="country" value={country} onChange={(e) => setCountry(e.target.value)} className={cn("h-11 w-full border border-input bg-background px-3 text-sm", hl("country"))}>
              <option value="">Not specified</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{countryFlag(c.code)} {c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-label">Funding</Label>
            <div className="flex h-11 items-center gap-2">
              <div className={cn("flex border border-line", hl("funding"))} role="group" aria-label="Funding">
                {FUNDING.map((f) => (
                  <button key={f.key} type="button" aria-pressed={funding === f.key} onClick={() => setFunding(f.key)} className={cn("px-3 py-2 font-mono text-[11px] uppercase tracking-wider", funding === f.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{f.label}</button>
                ))}
              </div>
              {funding && <button type="button" onClick={() => setFunding("")} className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">Clear</button>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teamSize" className="text-label">Team size</Label>
            <select id="teamSize" value={teamSize} onChange={(e) => setTeamSize(e.target.value as TeamSize | "")} className={cn("h-11 w-full border border-input bg-background px-3 text-sm", hl("teamSize"))}>
              <option value="">Not specified</option>
              {TEAM_SIZES.map((t) => <option key={t} value={t}>{t} {t === "1" ? "person" : "people"}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="foundedAt" className="text-label">Founded</Label>
            <Input id="foundedAt" name="foundedAt" type="month" min="1990-01" max={MAX_MONTH} defaultValue={defaults.foundedAt} className={cn("h-11 bg-background font-mono", hl("foundedAt"))} />
            <p className="font-mono text-[11px] text-muted-foreground">Optional. Used for benchmark age cohorts (otherwise we compare by tracking age).</p>
          </div>
        </div>
      </Panel>

      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionLabel>Product details</SectionLabel>
        <Limited label="Value proposition" name="valueProposition" max={PROFILE_LIMITS.valueProposition} defaultValue={defaults.valueProposition} placeholder="What does it do, in one breath?" textarea rows={2} className={hl("valueProposition")} />
        <Limited label="Problem solved" name="problemSolved" max={PROFILE_LIMITS.problemSolved} defaultValue={defaults.problemSolved} placeholder="What was painful before?" textarea rows={2} className={hl("problemSolved")} />
        <Limited label="Audience" name="audience" max={PROFILE_LIMITS.audience} defaultValue={defaults.audience} placeholder="Who is it for?" textarea rows={2} className={hl("audience")} />
        <Limited label="Pricing model" name="pricingSummary" max={PROFILE_LIMITS.pricingSummary} defaultValue={defaults.pricingSummary} placeholder="Free tier, per-seat plans, lifetime deal… (describe the model, never revenue numbers)" textarea rows={2} className={hl("pricingSummary")} />
        <Limited label="Additional info" name="additionalInfo" max={PROFILE_LIMITS.additionalInfo} defaultValue={defaults.additionalInfo} placeholder="Anything else worth knowing." textarea rows={3} className={hl("additionalInfo")} />
      </Panel>

      <section className="space-y-4">
        <SectionLabel>Additional settings</SectionLabel>
        {initial && <Field label="Slug" name="slug" defaultValue={defaults.slug} placeholder="acme" className="font-mono" />}
        <Toggle label="Anonymous mode" hint="Hides your identity, cofounders, logo, website and store links on the public page, cards and the API. Name and metrics stay." checked={anonymous} onChange={setAnonymous} testId="anonymous" />
        <Toggle label="Hide from Google" hint="Adds noindex to the public page and its share pages and removes it from the sitemap. Boards and the API still list it." checked={hideFromSearch} onChange={setHideFromSearch} testId="hide-from-search" />
      </section>

      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={saving || uploading}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

// "YYYY-MM" ⇄ first day of that month (UTC), which is the precision the backend stores.
const monthValue = (ms: number) => new Date(ms).toISOString().slice(0, 7);
const MAX_MONTH = monthValue(Date.now());
const parseMonth = (v: string) => { const m = /^(\d{4})-(\d{2})$/.exec(v); return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, 1) : undefined; };

function Field({ label, name, className, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-label">{label}</Label>
      <Input id={name} name={name} className={`h-11 bg-background ${className ?? ""}`} {...props} />
    </div>
  );
}

// Text field with a live "n/max" counter; the browser enforces maxLength, the server slices again.
function Limited({ label, name, max, textarea, defaultValue, className, ...props }: { label: string; name: string; max: number; textarea?: boolean; defaultValue?: string } & Omit<React.ComponentProps<"textarea"> & React.ComponentProps<"input">, "defaultValue">) {
  const [n, setN] = useState((defaultValue ?? "").length);
  const shared = { id: name, name, defaultValue, maxLength: max, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setN(e.target.value.length), className: cn("bg-background", className) };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={name} className="text-label">{label}</Label>
        <span className={cn("font-mono text-[11px] tabular-nums", n >= max ? "text-pink" : "text-muted-foreground")}>{n}/{max}</span>
      </div>
      {textarea ? <Textarea {...shared} {...(props as React.ComponentProps<"textarea">)} /> : <Input {...shared} {...(props as React.ComponentProps<"input">)} className={cn("h-11 bg-background", className)} />}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, testId, className }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; testId?: string; className?: string }) {
  return (
    <label className={cn("flex items-start justify-between gap-4 border border-line bg-background p-3", className)}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} className="mt-0.5 shrink-0" />
    </label>
  );
}

// Names of the submitted fields whose value differs from the stored project (never the values themselves).
function changedFields(initial: Doc<"saas">, data: Record<string, unknown>) {
  const before = initial as unknown as Record<string, unknown>;
  return Object.keys(data).filter((k) => JSON.stringify(data[k] ?? null) !== JSON.stringify(before[k] ?? null)).join(",");
}

