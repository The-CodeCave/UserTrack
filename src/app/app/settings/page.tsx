"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const me = useQuery(api.profiles.me);
  const setOptIn = useMutation(api.profiles.setDigestOptIn);
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <SectionLabel>Settings</SectionLabel>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Account</h1>
      <Panel className="mt-6 space-y-4 p-5">
        <div>
          <div className="text-label">Email</div>
          <div className="mt-1 font-mono text-sm">{me?.user.email ?? "…"}</div>
        </div>
        <div>
          <div className="text-label">Sync schedule</div>
          <div className="mt-1 text-sm text-muted-foreground">Every 4 hours, automatically, spread over 10 minutes. Failed syncs retry twice. Snapshots are immutable.</div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-label">Weekly digest email</div>
            <div className="mt-1 text-sm text-muted-foreground">Monday 08:00 UTC. Always available in-app under Digest.</div>
          </div>
          <Switch checked={me?.profile?.digestOptIn ?? true} onCheckedChange={(v) => setOptIn({ optIn: v })} />
        </div>
        <Button variant="outline" onClick={async () => { await authClient.signOut(); router.push("/"); router.refresh(); }}>Sign out</Button>
      </Panel>
    </div>
  );
}
