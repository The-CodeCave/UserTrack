"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Globe, Layers, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Platform } from "@/lib/stack-recommendation";
import { cn } from "@/lib/utils";

export interface PlatformValue { projectType: Platform; appStoreUrl?: string; playStoreUrl?: string }

const PLATFORMS: { value: Platform; label: string; blurb: string; icon: typeof Globe }[] = [
  { value: "web", label: "Web SaaS", blurb: "Browser app with an auth provider or database", icon: Globe },
  { value: "mobile", label: "Mobile App", blurb: "iOS / Android — Firebase, Supabase or your backend", icon: Smartphone },
  { value: "hybrid", label: "Both", blurb: "Web and mobile sharing one user base", icon: Layers },
];

// "What are you tracking?" tiles plus optional store links for mobile / hybrid. Empty store URLs are sent as "" so they clear server-side.
export function PlatformStep({ initial, submitLabel = "Continue", onSubmit }: { initial?: Partial<PlatformValue>; submitLabel?: string; onSubmit: (v: PlatformValue) => Promise<void> | void }) {
  const [type, setType] = useState<Platform | undefined>(initial?.projectType);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!type) return;
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    setSaving(true);
    try {
      await onSubmit({ projectType: type, appStoreUrl: s("appStoreUrl"), playStoreUrl: s("playStoreUrl") });
    } catch (err) {
      toast.error((err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {PLATFORMS.map((p) => (
          <button key={p.value} type="button" onClick={() => setType(p.value)} aria-pressed={type === p.value} className={cn("flex min-h-28 flex-col items-start gap-2 border p-4 text-left transition-colors", type === p.value ? "border-pink bg-pink/5" : "border-line hover:border-line-strong")}>
            <p.icon className={cn("size-5", type === p.value ? "text-pink" : "text-muted-foreground")} />
            <span className="font-semibold">{p.label}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">{p.blurb}</span>
          </button>
        ))}
      </div>
      {type && type !== "web" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="appStoreUrl" className="text-label">App Store URL (optional)</Label>
            <Input id="appStoreUrl" name="appStoreUrl" type="url" defaultValue={initial?.appStoreUrl} placeholder="https://apps.apple.com/app/id123456789" className="h-11 bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="playStoreUrl" className="text-label">Google Play URL (optional)</Label>
            <Input id="playStoreUrl" name="playStoreUrl" type="url" defaultValue={initial?.playStoreUrl} placeholder="https://play.google.com/store/apps/details?id=com.acme" className="h-11 bg-background" />
          </div>
        </div>
      )}
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={!type || saving}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
