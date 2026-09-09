"use client";

import { Suspense, useState } from "react";
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
import { ConnectedAccountsPanel } from "@/components/app/settings/connected-accounts";
import { track } from "@/lib/analytics";

const LINKS = [
  { href: "/app/settings/notifications", label: "Email notifications", blurb: "Reminders, milestones, alerts, reports.", Icon: Bell },
  { href: "/app/settings/social", label: "Social & X", blurb: "X handle, connected account, auto-share.", Icon: Share2 },
  { href: "/app/reports", label: "Monthly reports", blurb: "Every completed month, all products.", Icon: FileBarChart },
];

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
    <div className="app-page space-y-4">
      <div>
        <SectionLabel>Settings</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Account</h1>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Panel className="space-y-4 p-5">
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
          {LINKS.map(({ href, label, blurb, Icon }) => (
            <Link key={href} href={href} className="group block">
              <Panel className="flex items-center gap-3 p-4 transition-colors group-hover:border-line-strong">
                <Icon className="size-4 shrink-0 text-pink" />
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted-foreground">{blurb}</div></div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Panel>
            </Link>
          ))}
        </div>
        <Suspense><ConnectedAccountsPanel /></Suspense>
      </div>

      <DataPrivacyPanel />
    </div>
  );
}
