"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SaasForm({
  initial,
  submitLabel = "Save",
  onSaved,
}: {
  initial?: Doc<"saas"> | null;
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
      tags: s("tags").split(",").map((t) => t.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      const id = initial ? (await update({ id: initial._id, slug: s("slug") || undefined, ...data }), initial._id) : await create(data);
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
        <Field label="Logo URL (optional)" name="logoUrl" defaultValue={initial?.logoUrl} placeholder="https://acme.com/logo.png" type="url" />
        <Field label="Tags (comma separated)" name="tags" defaultValue={initial?.tags.join(", ")} placeholder="analytics, devtools" />
      </div>
      {initial && <Field label="Slug" name="slug" defaultValue={initial.slug} placeholder="acme" className="font-mono" />}
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={saving}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

function Field({ label, name, className, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-label">{label}</Label>
      <Input id={name} name={name} className={`h-11 bg-background ${className ?? ""}`} {...props} />
    </div>
  );
}
