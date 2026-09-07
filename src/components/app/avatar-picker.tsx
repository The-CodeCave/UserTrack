"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { ImageDown, Link2, Loader2, Upload, User } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { GitHubIcon, XIcon } from "@/components/auth/provider-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { track } from "@/lib/analytics";
import { normalizeXHandle, xHandleError } from "@/lib/social";
import { cn } from "@/lib/utils";

export type AvatarValue = { url?: string; storageId?: Id<"_storage">; preview?: string };

const MAX = 1_048_576;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || null;

const SOURCE_LABEL = { x: "X", github: "GitHub", gravatar: "Gravatar" } as const;

// Avatar as a file, fetched from the handles the founder already typed, or a pasted link — in that order of
// convenience. A fetched picture is copied into our own storage, so it keeps working when the origin changes it.
export function AvatarPicker({ value, onChange, xHandle, githubHandle, name, autoPull }: {
  value: AvatarValue; onChange: (v: AvatarValue) => void; xHandle?: string; githubHandle?: string; name?: string; autoPull?: boolean;
}) {
  const uploadUrl = useMutation(api.profiles.generateAvatarUploadUrl);
  const fetchAvatar = useAction(api.enrich.avatar);
  const [busy, setBusy] = useState<"upload" | "fetch" | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pulled, setPulled] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const tried = useRef(new Set<string>());
  const handle = normalizeXHandle(xHandle);
  const github = githubHandle?.trim().replace(/^@/, "") ?? "";
  const xReady = Boolean(handle) && !xHandleError(xHandle);
  // Gravatar needs nothing but the address we already have, so there is always something to try.
  const fetchLabel = xReady ? "From X" : github ? "From GitHub" : "Fetch";
  const FetchIcon = xReady ? XIcon : github ? GitHubIcon : ImageDown;
  const key = `${xReady ? handle : ""}|${github}`;
  const src = value.preview ?? value.url;

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX || !TYPES.includes(f.type)) { toast.error("Avatar must be a PNG, JPG or WebP up to 1 MB"); return; }
    setBusy("upload");
    try {
      const res = await fetch(await uploadUrl(), { method: "POST", headers: { "Content-Type": f.type }, body: f });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      onChange({ storageId, preview: URL.createObjectURL(f) });
      setShowUrl(false);
      track("avatar_autofill", { source: "upload" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  }

  // `silent` is the automatic attempt: a founder who simply has no picture anywhere should not be told off for it.
  async function pull(silent: boolean) {
    setBusy("fetch");
    try {
      const a = await fetchAvatar({ x: xReady ? handle : undefined, github: github || undefined, includeEmail: !silent });
      onChange({ url: a.url, storageId: a.storageId });
      setShowUrl(false);
      setPulled(SOURCE_LABEL[a.source]);
      track("avatar_autofill", { source: a.source });
      toast.success(`Profile picture pulled from ${SOURCE_LABEL[a.source]}`);
    } catch (e) {
      if (!silent) toast.error(e instanceof ConvexError ? (e.data as { message?: string }).message ?? "Could not fetch a profile picture" : "Could not fetch a profile picture");
    } finally {
      setBusy(null);
    }
  }

  // Fills an empty avatar by itself, once per combination of handles, so signing up is "type @you" and nothing else.
  // Only runs when a handle was actually typed — the automatic path never reaches out on the account address alone.
  useEffect(() => {
    if (!autoPull || src || busy || (!xReady && !github) || tried.current.has(key)) return;
    const t = setTimeout(() => {
      if (tried.current.has(key)) return;
      tried.current.add(key);
      void pull(true);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPull, key, src, busy, xReady, github]);

  return (
    <div className="space-y-2">
      <Label className="text-label">Profile picture</Label>
      <div className="flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={() => file.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void onFile(e.dataTransfer.files?.[0]); }}
          aria-label="Upload a profile picture"
          className={cn("relative size-20 shrink-0 overflow-hidden rounded-full border bg-background transition-colors", dragging ? "border-pink" : "border-line hover:border-line-strong")}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-mono text-lg text-muted-foreground">
              {initials(name ?? "") ?? <User className="size-6" />}
            </span>
          )}
          {busy && <span className="absolute inset-0 flex items-center justify-center bg-background/70"><Loader2 className="size-5 animate-spin text-pink" /></span>}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <input ref={file} type="file" accept={TYPES.join(",")} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="avatar-file" />
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => file.current?.click()}>
              {busy === "upload" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void pull(false)} data-testid="avatar-fetch"
              title={xReady ? `Fetch the picture on @${handle}` : github ? `Fetch the picture on github.com/${github}` : "Fetch the picture linked to your email address"}>
              {busy === "fetch" ? <Loader2 className="size-3.5 animate-spin" /> : <FetchIcon className="size-3.5" />} {fetchLabel}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowUrl((s) => !s)}><Link2 className="size-3.5" /> Link</Button>
            {src && <Button type="button" size="sm" variant="ghost" onClick={() => { onChange({}); setShowUrl(false); }}>Remove</Button>}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            {pulled ? `Pulled from ${pulled} — swap it any time.` : "Drop a file on the circle, or fetch it from X, GitHub or Gravatar. PNG, JPG, WebP · max 1 MB."}
          </p>
          {showUrl && (
            <Input value={value.storageId ? "" : value.url ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…/me.png" type="url" aria-label="Avatar URL" className="h-10 bg-background" />
          )}
        </div>
      </div>
    </div>
  );
}
