"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Link2, Loader2, Upload, User } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { XIcon } from "@/components/auth/provider-icons";
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

// Avatar as a file, pulled from X, or a pasted link — in that order of convenience. The X pull copies the picture into
// our own storage, so it keeps working when the founder changes it on X.
export function AvatarPicker({ value, onChange, xHandle, name, autoPull }: {
  value: AvatarValue; onChange: (v: AvatarValue) => void; xHandle?: string; name?: string; autoPull?: boolean;
}) {
  const uploadUrl = useMutation(api.profiles.generateAvatarUploadUrl);
  const pullX = useAction(api.enrich.xAvatar);
  const [busy, setBusy] = useState<"upload" | "x" | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pulled, setPulled] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const tried = useRef(new Set<string>());
  const handle = normalizeXHandle(xHandle);
  const canPullX = Boolean(handle) && !xHandleError(xHandle);
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

  async function fromX() {
    if (!canPullX) return;
    setBusy("x");
    try {
      const a = await pullX({ handle });
      onChange({ url: a.url, storageId: a.storageId });
      setShowUrl(false);
      setPulled(true);
      track("avatar_autofill", { source: "x" });
      toast.success(`Profile picture pulled from @${handle}`);
    } catch (e) {
      toast.error(e instanceof ConvexError ? (e.data as { message?: string }).message ?? "Could not fetch that profile picture" : "Could not fetch that profile picture");
    } finally {
      setBusy(null);
    }
  }

  // A typed handle fills an empty avatar by itself, once per handle, so signing up is "type @you" and nothing else.
  useEffect(() => {
    if (!autoPull || !canPullX || src || busy || tried.current.has(handle)) return;
    const t = setTimeout(() => {
      if (tried.current.has(handle)) return;
      tried.current.add(handle);
      void fromX();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPull, canPullX, handle, src, busy]);

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
            <Button type="button" size="sm" variant="outline" disabled={busy !== null || !canPullX} onClick={fromX} data-testid="avatar-from-x"
              title={canPullX ? `Fetch the picture on @${handle}` : "Add your X handle first"}>
              {busy === "x" ? <Loader2 className="size-3.5 animate-spin" /> : <XIcon />} From X
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowUrl((s) => !s)}><Link2 className="size-3.5" /> Link</Button>
            {src && <Button type="button" size="sm" variant="ghost" onClick={() => { onChange({}); setShowUrl(false); }}>Remove</Button>}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            {pulled ? `Pulled from @${handle} — swap it any time.` : "Drop a file on the circle, or pull it from X. PNG, JPG, WebP · max 1 MB."}
          </p>
          {showUrl && (
            <Input value={value.storageId ? "" : value.url ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…/me.png" type="url" aria-label="Avatar URL" className="h-10 bg-background" />
          )}
        </div>
      </div>
    </div>
  );
}
