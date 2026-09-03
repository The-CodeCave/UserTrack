"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Bell, ChevronRight, FileBarChart, Share2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button } from "@/components/ui/button";
import { DataPrivacyPanel } from "@/components/app/settings/data-privacy";
import { track } from "@/lib/analytics";

export default function SettingsPage() {
  const me = useQuery(api.profiles.me);
  const prefs = useQuery(api.email.prefs.mine);
  const router = useRouter();
  const [sending, setSending] = useState(false);

  async function resendVerification() {
    if (!me?.user.email) return;
    setSending(true);
    const res = await authClient.sendVerificationEmail({ email: me.user.email, callbackURL: "/app/settings" });
    setSending(false);
    if (res.error) toast.error(res.error.message ?? "Could not send verification email");
    else toast.success("Verification email sent");
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <SectionLabel>Settings</SectionLabel>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Account</h1>
      <Panel className="mt-6 space-y-4 p-5">
        <div>
          <div className="text-label">Email</div>
          <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-sm">
            {me?.user.email ?? "…"}
            {prefs && !prefs.emailVerified && (
              <Button variant="outline" size="xs" onClick={resendVerification} disabled={sending}>Verify email</Button>
            )}
            {prefs?.emailVerified && <span className="font-mono text-[10px] uppercase tracking-wider text-pink">verified</span>}
          </div>
        </div>
        <div>
          <div className="text-label">Sync schedule</div>
          <div className="mt-1 text-sm text-muted-foreground">Every 4 hours, automatically, spread over 10 minutes. Failed syncs retry twice. Snapshots are immutable.</div>
        </div>
        <Button variant="outline" onClick={async () => { track("sign_out"); await authClient.signOut(); router.push("/"); router.refresh(); }}>Sign out</Button>
      </Panel>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link href="/app/settings/notifications" className="group">
          <Panel className="flex h-full items-center gap-3 p-4 transition-colors group-hover:border-line-strong">
            <Bell className="size-4 text-pink" />
            <div className="flex-1"><div className="text-sm font-medium">Email notifications</div><div className="text-xs text-muted-foreground">Reminders, milestones, alerts, reports.</div></div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Panel>
        </Link>
        <Link href="/app/settings/social" className="group">
          <Panel className="flex h-full items-center gap-3 p-4 transition-colors group-hover:border-line-strong">
            <Share2 className="size-4 text-pink" />
            <div className="flex-1"><div className="text-sm font-medium">Social &amp; X</div><div className="text-xs text-muted-foreground">X handle, connected account, auto-share.</div></div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Panel>
        </Link>
        <Link href="/app/reports" className="group">
          <Panel className="flex h-full items-center gap-3 p-4 transition-colors group-hover:border-line-strong">
            <FileBarChart className="size-4 text-pink" />
            <div className="flex-1"><div className="text-sm font-medium">Monthly reports</div><div className="text-xs text-muted-foreground">Every completed month, all products.</div></div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Panel>
        </Link>
      </div>
      <DataPrivacyPanel />
    </div>
  );
}
