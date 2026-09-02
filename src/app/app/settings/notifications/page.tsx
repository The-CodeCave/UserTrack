"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { NotificationPreferences, type PrefKey } from "@/components/app/notification-preferences";

export default function NotificationSettingsPage() {
  const prefs = useQuery(api.email.prefs.mine);
  const update = useMutation(api.email.prefs.update);
  const setTimezone = useMutation(api.email.prefs.setTimezone);
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

  useEffect(() => {
    if (prefs && !prefs.timezone && browserTz) void setTimezone({ timezone: browserTz });
  }, [prefs, browserTz, setTimezone]);

  async function change(key: PrefKey, value: boolean) {
    try {
      await update({ [key]: value });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <SectionLabel><Link href="/app/settings" className="hover:text-foreground">Settings</Link> / Notifications</SectionLabel>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Email notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every email should earn its place in your inbox. Turn off anything that does not.</p>
      {prefs === undefined && <Skeleton className="mt-6 h-72" />}
      {prefs === null && <Panel className="mt-6 p-5 text-sm text-muted-foreground">Sign in to manage notifications.</Panel>}
      {prefs && (
        <div className="mt-6 space-y-4">
          <Panel className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-label">Delivery</div>
              <div className="mt-1 font-mono text-sm">{prefs.email}</div>
              <div className="mt-1 text-xs text-muted-foreground">Reports arrive around 09:00 · {prefs.timezone ?? "UTC"}{browserTz && prefs.timezone && browserTz !== prefs.timezone ? ` (browser: ${browserTz})` : ""}</div>
            </div>
            {browserTz && browserTz !== prefs.timezone && (
              <Button variant="outline" size="sm" onClick={() => setTimezone({ timezone: browserTz }).then(() => toast.success(`Timezone set to ${browserTz}`))}>Use {browserTz}</Button>
            )}
          </Panel>
          <NotificationPreferences prefs={prefs} onChange={change} />
        </div>
      )}
    </div>
  );
}
