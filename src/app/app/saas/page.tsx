"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Plus, ArrowRight } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta } from "@/lib/format";

export default function SaasListPage() {
  const list = useQuery(api.saas.listMine);
  return (
    <div className="app-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>My SaaS</SectionLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Products</h1>
        </div>
        <Button render={<Link href="/app/saas/new" />}><Plus className="size-4" /> Add SaaS</Button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {list === undefined && [0, 1].map((i) => <Skeleton key={i} className="h-32" />)}
        {list?.length === 0 && (
          <Panel className="p-6 text-sm text-muted-foreground sm:col-span-2">No products yet. Add your first SaaS to get a public growth page.</Panel>
        )}
        {list?.map((s) => (
          <Link key={s._id} href={`/app/saas/${s._id}`} className="group">
            <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">/s/{s.slug} · {s.isPublic ? "public" : "draft"}</div>
                </div>
                <TrustBadge trust={s.trust} />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-label">Users</div>
                  <div className="tabular text-2xl font-semibold">{formatCompact(s.totalUsers)}</div>
                </div>
                <div className="text-right">
                  <div className="text-label">30d</div>
                  <div className="tabular font-mono text-sm text-pink">{formatDelta(s.newUsers30d)}</div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
