"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { slugify } from "@/lib/slug";
import { normalizeXHandle, xHandleError } from "@/lib/social";
import { readAttribution } from "@/lib/attribution";
import { AvatarPicker, type AvatarValue } from "@/components/app/avatar-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Initial = Partial<Pick<Doc<"profiles">, "username" | "displayName" | "avatarUrl" | "avatarStorageId" | "bio" | "website" | "x" | "github" | "linkedin" | "location">>;

export function ProfileForm({
  initial,
  defaultName,
  compact,
  submitLabel = "Save profile",
  onSaved,
}: {
  initial?: Initial | null;
  defaultName?: string;
  compact?: boolean;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const upsert = useMutation(api.profiles.upsert);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? defaultName ?? "");
  const [username, setUsername] = useState(initial?.username ?? slugify(defaultName ?? ""));
  const [touched, setTouched] = useState(Boolean(initial?.username));
  const [saving, setSaving] = useState(false);
  const [x, setX] = useState(initial?.x ?? "");
  // Controlled so the avatar fetch can use it; a GitHub sign-in prefills it even though the field is hidden in compact mode.
  const [github, setGithub] = useState(initial?.github ?? "");
  const [avatar, setAvatar] = useState<AvatarValue>({ url: initial?.avatarUrl, storageId: initial?.avatarStorageId });
  const xError = xHandleError(x);
  const check = useQuery(api.profiles.usernameAvailable, username.length >= 3 ? { username } : "skip");

  function onName(v: string) {
    setDisplayName(v);
    if (!touched) setUsername(slugify(v).replace(/-+$/, ""));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const opt = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
    setSaving(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
      await upsert({ displayName: displayName.trim(), username, bio: opt("bio"), website: opt("website"), x: normalizeXHandle(x) || undefined, github: github.trim() || undefined, linkedin: opt("linkedin"), avatarUrl: avatar.storageId ? undefined : avatar.url?.trim() || undefined, avatarStorageId: avatar.storageId, location: opt("location"), timezone, attribution: readAttribution() ?? undefined });
      toast.success("Profile saved");
      onSaved?.();
    } catch (err) {
      toast.error((err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setSaving(false);
    }
  }

  const status = username.length < 3 ? null : check === undefined ? "checking" : check.ok ? "ok" : check.reason;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="x" className="text-label">X handle {compact && <span className="normal-case tracking-normal">(optional)</span>}</Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-muted-foreground">@</span>
          <Input id="x" value={x} onChange={(e) => setX(e.target.value)} placeholder="yourhandle" aria-invalid={Boolean(xError)} className="h-11 bg-background pl-8 font-mono" />
        </div>
        <p className={xError ? "font-mono text-[11px] text-destructive" : "font-mono text-[11px] text-muted-foreground"}>{xError ?? (normalizeXHandle(x) ? `Shown as @${normalizeXHandle(x)} — we fetch your picture from there` : "@name, name or your x.com URL")}</p>
      </div>
      <AvatarPicker value={avatar} onChange={setAvatar} xHandle={x} githubHandle={github} name={displayName} autoPull />
      <div className="space-y-1.5">
        <Label htmlFor="displayName" className="text-label">Name</Label>
        <Input id="displayName" value={displayName} onChange={(e) => onName(e.target.value)} placeholder="Ada Lovelace" required minLength={2} className="h-11 bg-background" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="username" className="text-label">Handle</Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-muted-foreground">/u/</span>
          <Input id="username" value={username} onChange={(e) => { setTouched(true); setUsername(slugify(e.target.value)); }} placeholder="ada" required className="h-11 bg-background pl-10 pr-9 font-mono" />
          <span className="absolute inset-y-0 right-3 flex items-center">
            {status === "checking" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {status === "ok" && <Check className="size-4 text-pink" />}
            {(status === "taken" || status === "invalid") && <X className="size-4 text-destructive" />}
          </span>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {status === "taken" ? "Already taken" : status === "invalid" ? "3–30 chars, letters, numbers, dashes" : "Your public profile URL"}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bio" className="text-label">Bio {compact && <span className="normal-case tracking-normal">(optional)</span>}</Label>
        <Textarea id="bio" name="bio" defaultValue={initial?.bio} placeholder="Building in public since 2024." maxLength={160} rows={2} className="bg-background" />
      </div>
      {!compact && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website" name="website" defaultValue={initial?.website} placeholder="https://yourdomain.com" type="url" />
          <Field label="Location" name="location" defaultValue={initial?.location} placeholder="Berlin, DE" maxLength={60} />
          <Field label="GitHub" name="github" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="ada" />
          <Field label="LinkedIn" name="linkedin" defaultValue={initial?.linkedin} placeholder="ada-lovelace" />
        </div>
      )}
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={saving || status === "taken" || status === "invalid" || Boolean(xError)}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

function Field({ label, name, ...props }: { label: React.ReactNode; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-label">{label}</Label>
      <Input id={name} name={name} className="h-11 bg-background" {...props} />
    </div>
  );
}
