"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, RefreshCw, Unplug } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SHARE_CATEGORIES, SHARE_CATEGORY_META, type ShareCategory } from "@convex/lib/shareRules";
import { X_STATE_LABEL, normalizeXHandle, xHandleError, xProfileUrl } from "@/lib/social";
import { formatCompact, timeAgo } from "@/lib/format";
import { FOLLOWERS_REFRESH_COOLDOWN_MS } from "@convex/lib/xApi";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

export default function SocialSettingsPage() {
  return <Suspense fallback={<div className="app-page"><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-64" /></div>}><SocialSettings /></Suspense>;
}

function SocialSettings() {
  const s = useQuery(api.social.status);
  const update = useMutation(api.profiles.updateSocial);
  const disconnect = useAction(api.social.disconnect);
  const refreshFollowers = useAction(api.social.refreshNow);
  const params = useSearchParams();
  const [handle, setHandle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Mirrors the server's 1/min rule so the button greys out right after a refresh; the action enforces it regardless.
  const [cooling, setCooling] = useState(false);
  const value = handle ?? s?.handle ?? "";
  const error = xHandleError(value);
  const dirty = handle !== null && normalizeXHandle(handle) !== (s?.handle ?? "");

  useEffect(() => {
    const st = params.get("x");
    if (st === "connected") {
      track("x_connected");
      toast.success("X account connected");
    }
    else if (st === "error") toast.error(params.get("reason") || "Could not connect X");
  }, [params]);

  if (s === undefined) return <div className="app-page"><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-64" /></div>;
  if (s === null) return null;

  async function saveHandle() {
    setSaving(true);
    try {
      const h = normalizeXHandle(value);
      await update(h ? { x: h } : { clearX: true });
      setHandle(null);
      toast.success(h ? `X handle saved as @${h}` : "X handle removed");
    } catch (e) {
      toast.error((e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setSaving(false);
    }
  }
  async function refreshNow() {
    setRefreshing(true);
    try {
      const r = await refreshFollowers({});
      track("x_followers_refreshed");
      toast.success(`${formatCompact(r.followers)} followers on X`);
      setCooling(true);
      setTimeout(() => setCooling(false), FOLLOWERS_REFRESH_COOLDOWN_MS);
    } catch (e) {
      toast.error(e instanceof ConvexError ? String(e.data) : "Could not refresh the follower count");
    } finally {
      setRefreshing(false);
    }
  }
  async function setPref(patch: { allowTagging?: boolean; allowPromotion?: boolean; autoShare?: Partial<Record<ShareCategory, boolean>> }) {
    try { await update({ socialPrefs: patch }); } catch (e) { toast.error((e as Error).message); }
  }

  const connected = s.state === "connected_via_oauth";

  return (
    <div className="app-page space-y-4">
      <div>
        <Link href="/app/settings" className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> Settings</Link>
        <SectionLabel className="mt-4">Social</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">X &amp; sharing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your X handle appears on your founder profile and share cards. Nothing is posted on your behalf unless you connect an account and switch a category on.</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="text-label">X handle</div>
          <span className={cn("border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", connected ? "border-pink/60 text-pink" : "border-line text-muted-foreground")}>{X_STATE_LABEL[s.state]}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-muted-foreground">@</span>
            <Input value={value} onChange={(e) => setHandle(e.target.value)} placeholder="yourhandle" aria-invalid={Boolean(error)} className="h-11 bg-background pl-8 font-mono" disabled={connected} />
          </div>
          {!connected && <Button onClick={saveHandle} disabled={saving || Boolean(error) || !dirty} className="h-11">{saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save</Button>}
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">{error ?? (value ? <>Displayed as <a className="text-foreground hover:text-pink" href={xProfileUrl(value)} target="_blank" rel="noreferrer">@{normalizeXHandle(value)}</a>. Paste @name, name or your x.com URL.</> : "Optional. Paste @name, name or your x.com URL.")}</p>
        {!connected && value && <p className="font-mono text-[11px] text-muted-foreground">A typed handle is shown as provided by you — it is never presented as a verified X account.{s.oauthEnabled ? " Connect X below to show your follower count on your profile." : ""}</p>}
      </Panel>

      <Panel className="space-y-3 p-5">
        <div className="text-label">Connected X account</div>
        {connected && s.connection ? (
          <div className="flex flex-wrap items-center gap-3">
            {s.connection.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.connection.avatarUrl} alt="" className="size-10 rounded-full border border-line" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">@{s.connection.handle}{s.connection.name ? <span className="text-muted-foreground"> · {s.connection.name}</span> : null}</div>
              <div className="font-mono text-[11px] text-muted-foreground">Connected {timeAgo(s.connection.connectedAt)}{s.connection.lastPostAt ? ` · last post ${timeAgo(s.connection.lastPostAt)}` : ""}{s.connection.status === "error" ? " · needs reconnecting" : ""}</div>
              {s.connection.lastError && <div className="mt-1 font-mono text-[11px] text-destructive">{s.connection.lastError}</div>}
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span><span className="font-semibold text-foreground">𝕏</span> {s.followers !== undefined ? <><span className="tabular text-foreground">{formatCompact(s.followers)}</span> followers{s.followersAt ? ` · refreshed ${timeAgo(s.followersAt)}` : ""}</> : "Follower count not read yet"}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={refreshing || cooling} title={cooling ? "Once per minute" : "Read your follower count from X now"} onClick={refreshNow}>
                  {refreshing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Refresh now
                </Button>
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await disconnect({}); track("x_disconnected"); toast.success("Disconnected"); } finally { setBusy(false); } }}><Unplug className="size-4" /> Disconnect</Button>
          </div>
        ) : s.oauthEnabled ? (
          <>
            <p className="text-sm text-muted-foreground">Connect to import your handle, avatar and follower count (shown on your profile, refreshed daily) and to let UserTrack post selected milestones from your account. Scopes: read profile, post. You can disconnect any time.</p>
            <Button className="h-10" render={<a href="/api/social/x/connect" />}><span className="font-semibold">𝕏</span> Connect X</Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Connecting an X account is not enabled on this deployment yet. Your handle above still appears on your profile and cards, and every card has a one-click “Post to X”.</p>
        )}
      </Panel>

      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel className="space-y-4 p-5">
        <div>
          <div className="text-label">Auto-share from your account</div>
          <p className="mt-1 text-xs text-muted-foreground">Off by default. At most one automatic post per day; every card stays available in the Share Center either way.{connected ? "" : " Connect an X account to enable."}</p>
        </div>
        <div className="space-y-3">
          {SHARE_CATEGORIES.map((c) => (
            <label key={c} className={cn("flex cursor-pointer items-start justify-between gap-4", !connected && "opacity-60")}>
              <span><span className="block text-sm">{SHARE_CATEGORY_META[c].label}</span><span className="block text-xs text-muted-foreground">{SHARE_CATEGORY_META[c].hint}</span></span>
              <Switch checked={s.prefs.autoShare[c]} disabled={!connected} onCheckedChange={(v) => setPref({ autoShare: { [c]: v } })} />
            </label>
          ))}
        </div>
      </Panel>

      <Panel className="space-y-4 p-5">
        <div>
          <div className="text-label">UserTrack account</div>
          <p className="mt-1 text-xs text-muted-foreground">The @usertrack account may post major verified milestones (1K+ users, Top 10, #1). You control whether your products are promoted and whether you are tagged.{s.botEnabled ? "" : " Not active on this deployment yet."}</p>
        </div>
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span><span className="block text-sm">Allow UserTrack to promote my milestones</span><span className="block text-xs text-muted-foreground">Verified products only, a handful of posts per day across the whole platform.</span></span>
          <Switch checked={s.prefs.allowPromotion} onCheckedChange={(v) => setPref({ allowPromotion: v })} />
        </label>
        <label className={cn("flex cursor-pointer items-start justify-between gap-4", !s.prefs.allowPromotion && "opacity-60")}>
          <span><span className="block text-sm">Tag my X handle in those posts</span><span className="block text-xs text-muted-foreground">Adds “Built by @{s.handle || "you"}” when a handle is set.</span></span>
          <Switch checked={s.prefs.allowTagging} disabled={!s.prefs.allowPromotion} onCheckedChange={(v) => setPref({ allowTagging: v })} />
        </label>
      </Panel>

      </div>

      {s.recentPosts.length > 0 && (
        <Panel className="divide-y divide-line p-0">
          <div className="px-4 py-3 text-label">Recent automatic posts</div>
          {s.recentPosts.map((p) => (
            <div key={p._id} className="px-4 py-3">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className={cn("size-1.5 shrink-0", p.status === "posted" ? "bg-pink" : p.status === "failed" ? "bg-destructive" : "bg-muted-foreground")} />
                <span className="uppercase tracking-wider text-muted-foreground">{p.account === "usertrack" ? "@usertrack" : "your account"} · {p.status} · {timeAgo(p.createdAt)}</span>
                {p.providerPostId && p.status === "posted" && <a className="ml-auto text-foreground hover:text-pink" href={`https://x.com/i/status/${p.providerPostId}`} target="_blank" rel="noreferrer">open</a>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{p.text}</p>
              {p.error && <p className="mt-1 font-mono text-[11px] text-destructive">{p.error}</p>}
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
