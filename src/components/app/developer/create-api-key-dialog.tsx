"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SITE_URL } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyBlock, SecretReveal, errMsg } from "./copy-block";
import { track } from "@/lib/analytics";

export function CreateApiKeyDialog() {
  const create = useMutation(api.tokens.create);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    setBusy(true);
    try {
      const r = await create({ type: "api", name });
      track("token_created", { type: "api", origin: "dashboard" });
      setSecret(r.secret);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSecret(null); }}>
      <DialogTrigger render={<Button className="h-10" />}><Plus className="size-4" /> Create API key</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret ? "Your new API key" : "Create API key"}</DialogTitle>
          <DialogDescription>{secret ? "Send it as a Bearer token on every request." : "Read-only access to public metrics. Name it after where it will be used."}</DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="space-y-4">
            <SecretReveal secret={secret} />
            <CopyBlock label="Example" text={`curl -H "Authorization: Bearer ${secret}" ${SITE_URL}/api/v1/saas`} />
            <Button variant="outline" className="h-10 w-full" onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="api-name" className="text-label">Name</Label>
              <Input id="api-name" name="name" placeholder="e.g. website widget" required maxLength={60} autoComplete="off" className="h-11 bg-background font-mono text-sm" />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Create key</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
