"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { Logo } from "@/components/site/logo";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationPreferences, type PrefKey, type Prefs } from "@/components/app/notification-preferences";

const ALL_OFF: Prefs = { productNudges: false, growthMilestones: false, rankingMilestones: false, growthAlerts: false, monthlyReport: false, weeklyDigest: false, followedSaasUpdates: false, followedMilestones: false, followedRanking: false, followedSpikes: false };

export default function EmailPreferencesPage() {
  return (
    <main className="bp-grid relative flex flex-1 flex-col items-center px-4 py-12">
      <Link href="/" className="mb-8"><Logo /></Link>
      <div className="w-full max-w-xl"><Suspense><Inner /></Suspense></div>
    </main>
  );
}

function Inner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const wantsUnsubscribe = params.get("unsubscribe") === "1";
  const data = useQuery(api.email.prefs.byToken, token ? { token } : "skip");
  const update = useMutation(api.email.prefs.updateByToken);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (wantsUnsubscribe && data && !done) {
      update({ token, ...ALL_OFF }).then(() => { setDone(true); toast.success("Unsubscribed from all optional emails"); }).catch((e) => toast.error((e as Error).message));
    }
  }, [wantsUnsubscribe, data, done, token, update]);

  if (!token || data === null) {
    return (
      <Panel className="p-6 sm:p-8">
        <SectionLabel>Email preferences</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This link is invalid or has expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">Preference links are valid for 90 days. Sign in to manage notifications from your settings.</p>
        <Button className="mt-5" render={<Link href="/app/settings/notifications" />}>Open settings</Button>
      </Panel>
    );
  }
  if (data === undefined) return <Skeleton className="h-96" />;

  async function change(key: PrefKey, value: boolean) {
    try {
      await update({ token, [key]: value });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const allOff = Object.values(ALL_OFF).every((_, i) => !Object.values(data as Prefs)[i]);

  return (
    <div className="space-y-4">
      <Panel className="p-6 sm:p-8">
        <SectionLabel>Email preferences</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{wantsUnsubscribe && done ? "You are unsubscribed" : "Choose what UserTrack sends you"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">For <span className="font-mono">{data.emailMasked}</span>. Changes save instantly. Account and security messages always arrive.</p>
        {!allOff && (
          <Button variant="outline" size="sm" className="mt-4" onClick={() => update({ token, ...ALL_OFF }).then(() => toast.success("Unsubscribed from all optional emails"))}>Unsubscribe from everything optional</Button>
        )}
      </Panel>
      <NotificationPreferences prefs={data} onChange={change} />
    </div>
  );
}
