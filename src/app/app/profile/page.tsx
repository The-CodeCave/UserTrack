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

export default function ProfilePage() {
  const me = useQuery(api.profiles.me);
  if (!me?.profile) return <div className="p-6"><Skeleton className="h-64 max-w-2xl" /></div>;
  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="flex items-end justify-between">
        <div>
          <SectionLabel>Profile</SectionLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">@{me.profile.username}</h1>
        </div>
        <Button variant="outline" size="sm" render={<Link href={`/u/${me.profile.username}`} target="_blank" />}><ExternalLink className="size-4" /> Public page</Button>
      </div>
      <Panel className="mt-6 p-5"><ProfileForm initial={me.profile} /></Panel>
    </div>
  );
}
