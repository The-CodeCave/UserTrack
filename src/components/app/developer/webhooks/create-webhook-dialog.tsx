"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { WEBHOOK_EVENTS, type WebhookEventType } from "@convex/lib/webhooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyBlock, SecretReveal, errMsg } from "../copy-block";
import { nodeVerifySnippet } from "./snippets";
import { track } from "@/lib/analytics";

type EventType = Exclude<WebhookEventType, "webhook.test">;

export function CreateWebhookDialog({ projects, disabled }: { projects: { id: Id<"saas">; name: string }[]; disabled?: boolean }) {
  const create = useMutation(api.webhooks.create);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<EventType[]>(WEBHOOK_EVENTS.map((e) => e.type));
  const [secret, setSecret] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const saasId = String(fd.get("saasId") ?? "");
    if (events.length === 0) return toast.error("Pick at least one event");
    setBusy(true);
    try {
      const r = await create({ url: String(fd.get("url") ?? ""), description: String(fd.get("description") ?? "") || undefined, events, saasId: saasId ? (saasId as Id<"saas">) : undefined });
      track("webhook_created", { events: events.join(",") });
      setSecret(r.secret);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSecret(null); }}>
      <DialogTrigger render={<Button className="h-10" disabled={disabled} />}><Plus className="size-4" /> Add endpoint</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret ? "Endpoint created" : "Add webhook endpoint"}</DialogTitle>
          <DialogDescription>{secret ? "Store the signing secret now — it is never shown again." : "We POST a signed JSON payload to your URL whenever a subscribed event happens."}</DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="space-y-4">
            <SecretReveal secret={secret} />
            <CopyBlock label="Verify (Node)" text={nodeVerifySnippet()} hint="Compare against the raw request body, not a re-serialized one." />
            <Button variant="outline" className="h-10 w-full" onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wh-url" className="text-label">URL</Label>
              <Input id="wh-url" name="url" type="url" placeholder="https://example.com/hooks/usertrack" required autoComplete="off" className="h-11 bg-background font-mono text-sm" />
              <p className="font-mono text-[11px] text-muted-foreground">https only · public hostnames only · 10 s timeout</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-desc" className="text-label">Description (optional)</Label>
              <Input id="wh-desc" name="description" placeholder="e.g. Slack notifier" maxLength={120} autoComplete="off" className="h-11 bg-background text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-saas" className="text-label">Project scope</Label>
              <select id="wh-saas" name="saasId" defaultValue="" className="h-11 w-full border border-input bg-background px-3 text-sm">
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-label">Events</span><button type="button" className="font-mono text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setEvents(events.length === WEBHOOK_EVENTS.length ? [] : WEBHOOK_EVENTS.map((e) => e.type))}>{events.length === WEBHOOK_EVENTS.length ? "Clear" : "Select all"}</button></div>
              <div className="divide-y divide-line border border-line">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev.type} className="flex cursor-pointer items-start gap-3 p-3">
                    <input type="checkbox" checked={events.includes(ev.type)} onChange={(e) => setEvents(e.target.checked ? [...events, ev.type] : events.filter((t) => t !== ev.type))} className="mt-0.5 accent-pink" />
                    <span><span className="block font-mono text-xs">{ev.type}</span><span className="block text-xs text-muted-foreground">{ev.blurb}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" className="h-10 w-full" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Create endpoint</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
