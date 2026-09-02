"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { slugify } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Initial = Partial<Pick<Doc<"profiles">, "username" | "displayName" | "avatarUrl" | "bio" | "website" | "x" | "github" | "linkedin">>;

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
      await upsert({ displayName: displayName.trim(), username, bio: opt("bio"), website: opt("website"), x: opt("x"), github: opt("github"), linkedin: opt("linkedin"), avatarUrl: opt("avatarUrl") });
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
          <Field label="Avatar URL" name="avatarUrl" defaultValue={initial?.avatarUrl} placeholder="https://…/me.png" type="url" />
          <Field label="Website" name="website" defaultValue={initial?.website} placeholder="https://yourdomain.com" type="url" />
          <Field label="X handle" name="x" defaultValue={initial?.x} placeholder="ada" />
          <Field label="GitHub" name="github" defaultValue={initial?.github} placeholder="ada" />
          <Field label="LinkedIn" name="linkedin" defaultValue={initial?.linkedin} placeholder="ada-lovelace" />
        </div>
      )}
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={saving || status === "taken" || status === "invalid"}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-label">{label}</Label>
      <Input id={name} name={name} className="h-11 bg-background" {...props} />
    </div>
  );
}
