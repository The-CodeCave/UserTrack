"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { EmbedConfigurator } from "@/components/app/embed-configurator";
import { Skeleton } from "@/components/ui/skeleton";

export default function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const saas = useQuery(api.saas.getMine, { id: id as Id<"saas"> });
  if (saas === undefined) return <div className="app-page space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (saas === null) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;
  return (
    <div className="app-page space-y-6">
      <div>
        <SectionLabel><Link href="/app/saas" className="hover:text-foreground">My SaaS</Link> / <Link href={`/app/saas/${id}`} className="hover:text-foreground">{saas.name}</Link> / Embed</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Embed UserTrack</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live widgets and SVG badges for your website, README or docs. Every embed links back to your growth page.</p>
      </div>
      <EmbedConfigurator slug={saas.slug} name={saas.name} isPublic={saas.isPublic} embedSites={saas.embedSites} />
    </div>
  );
}
