"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES } from "@/lib/categories";
import type { PlatformValue } from "./platform-picker";

export function SaasForm({
  initial,
  platform,
  submitLabel = "Save",
  onSaved,
}: {
  initial?: Doc<"saas"> | null;
  platform?: PlatformValue;
  submitLabel?: string;
  onSaved?: (id: Id<"saas">) => void;
}) {
  const create = useMutation(api.saas.create);
  const update = useMutation(api.saas.update);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const data = {
      name: s("name"),
      websiteUrl: s("websiteUrl"),
      description: s("description"),
      logoUrl: s("logoUrl") || undefined,
      category: s("category") || undefined,
      tags: s("tags").split(",").map((t) => t.trim()).filter(Boolean),
      foundedAt: parseMonth(s("foundedAt")),
      ...platform,
    };
    setSaving(true);
    try {
      const id = initial ? (await update({ id: initial._id, slug: s("slug") || undefined, ...data }), initial._id) : await create(data);
      if (initial) track("project_updated", { fields: changedFields(initial, data) });
      else track("project_created", { source: "form" });
      toast.success(initial ? "Saved" : "SaaS created");
      onSaved?.(id);
    } catch (err) {
      toast.error((err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" name="name" defaultValue={initial?.name} placeholder="Acme Analytics" required minLength={2} />
        <Field label="Website" name="websiteUrl" defaultValue={initial?.websiteUrl} placeholder="https://acme.com" type="url" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-label">One-liner</Label>
        <Textarea id="description" name="description" defaultValue={initial?.description} placeholder="Product analytics for indie SaaS." maxLength={160} rows={2} required className="bg-background" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-label">Category</Label>
          <select id="category" name="category" defaultValue={initial?.category ?? ""} required className="h-11 w-full border border-input bg-background px-3 text-sm">
            <option value="" disabled>Pick a category</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        </div>
        <Field label="Tags (comma separated)" name="tags" defaultValue={initial?.tags.join(", ")} placeholder="analytics, devtools" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Logo URL (optional)" name="logoUrl" defaultValue={initial?.logoUrl} placeholder="https://acme.com/logo.png" type="url" />
        <div className="space-y-1.5">
          <Label htmlFor="foundedAt" className="text-label">Founded</Label>
          <Input id="foundedAt" name="foundedAt" type="month" min="1990-01" max={MAX_MONTH} defaultValue={initial?.foundedAt ? monthValue(initial.foundedAt) : undefined} className="h-11 bg-background font-mono" />
          <p className="font-mono text-[11px] text-muted-foreground">Optional. Used for benchmark age cohorts (otherwise we compare by tracking age).</p>
        </div>
      </div>
      {initial && <Field label="Slug" name="slug" defaultValue={initial.slug} placeholder="acme" className="font-mono" />}
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={saving}>
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

// Names of the submitted fields whose value differs from the stored project (never the values themselves).
function changedFields(initial: Doc<"saas">, data: Record<string, unknown>) {
  const before = initial as unknown as Record<string, unknown>;
  return Object.keys(data).filter((k) => JSON.stringify(data[k] ?? null) !== JSON.stringify(before[k] ?? null)).join(",");
}
