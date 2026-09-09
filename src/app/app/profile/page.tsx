"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { ProfileForm } from "@/components/app/profile-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { profileUrl } from "@/lib/site";

const SHOWN = [
  "Your products, their user counts and growth",
  "Your combined founder growth chart and share card",
  "Followers, X handle and the links you fill in below",
];

export default function ProfilePage() {
  const me = useQuery(api.profiles.me);
  if (!me?.profile) return <div className="app-page"><Skeleton className="h-64" /></div>;
  const url = profileUrl(me.profile.username);
  return (
    <div className="app-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>Profile</SectionLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">@{me.profile.username}</h1>
        </div>
        <Button variant="outline" size="sm" render={<Link href={`/u/${me.profile.username}`} target="_blank" />}><ExternalLink className="size-4" /> Public page</Button>
      </div>
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel className="p-5"><ProfileForm initial={me.profile} /></Panel>
        <Panel className="space-y-3 p-5">
          <SectionLabel>Your public page</SectionLabel>
          <div className="break-all border border-line bg-background px-3 py-2 font-mono text-xs">{url}</div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {SHOWN.map((line) => <li key={line} className="flex gap-2"><span aria-hidden className="mt-1.5 size-1 shrink-0 bg-pink" />{line}</li>)}
          </ul>
          <p className="font-mono text-[11px] text-muted-foreground">Only products you published appear there — drafts stay private.</p>
        </Panel>
      </div>
    </div>
  );
}
