"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Download, Loader2, Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FLASH_KEY } from "@/components/site/flash-toast";

const REMOVED = [
  "Your founder profile and public page (/u/…)",
  "Every product, its growth history, milestones and public page (/s/…)",
  "Connected-source credentials, API keys, MCP tokens and webhooks",
  "Follows, share cards, the X connection and your email preferences",
];

export function DataPrivacyPanel() {
  return (
    <Panel id="data-privacy" className="mt-4 space-y-5 p-5">
      <div>
        <SectionLabel>Data &amp; privacy</SectionLabel>
        <p className="mt-2 text-sm text-muted-foreground">Everything UserTrack stores about you, as one JSON file (GDPR Art. 20). Credentials and secrets are never included. Details in the <Link href="/privacy#self-service" className="underline underline-offset-4 hover:text-foreground">privacy policy</Link>.</p>
        <a href="/api/account/export" download="usertrack-export.json" className={cn(buttonVariants({ variant: "outline" }), "mt-3")}>
          <Download className="size-4" /> Download my data
        </a>
      </div>
      <div className="border border-destructive/40 bg-destructive/5 p-4">
        <div className="text-label text-destructive">Danger zone</div>
        <p className="mt-2 text-sm text-muted-foreground">Deleting your account removes your profile, all products and their history, sources, tokens and webhooks. Public pages disappear immediately. This cannot be undone.</p>
        <DeleteAccountDialog />
      </div>
    </Panel>
  );
}

function DeleteAccountDialog() {
  const deleteAccount = useMutation(api.account.deleteAccount);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = typed === "DELETE";

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    try {
      await deleteAccount({ confirm: "DELETE" });
      await authClient.signOut().catch(() => undefined);
      // Hard navigation: the app shell would otherwise bounce the signed-out session to /sign-in.
      sessionStorage.setItem(FLASH_KEY, "Your account has been deleted");
      window.location.assign("/");
    } catch (err) {
      setBusy(false);
      toast.error((err as Error).message.match(/Uncaught \w*Error: ([^\n]*)/)?.[1] ?? "Could not delete the account");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setOpen(v); setTyped(""); } }}>
      <DialogTrigger render={<Button variant="destructive" className="mt-3" />}><Trash2 className="size-4" /> Delete account</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Delete your UserTrack account?</DialogTitle>
          <DialogDescription>This permanently removes the following. Public pages disappear immediately; there is no grace period and no undo.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {REMOVED.map((line) => <li key={line} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 bg-destructive" />{line}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground">You will receive one confirmation email. Frozen monthly rankings keep only product name and position as a historical record.</p>
        <div className="space-y-1.5">
          <Label htmlFor="delete-confirm" className="text-label">Type DELETE to confirm</Label>
          <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" spellCheck={false} disabled={busy} className="h-11 bg-background font-mono text-sm" />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-10" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" className="h-10" disabled={!ready || busy} onClick={confirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Delete my account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
