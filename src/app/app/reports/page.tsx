"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta } from "@/lib/format";

export default function ReportsPage() {
  const reports = useQuery(api.email.reports.listMine);
  const preview = useMutation(api.email.reports.previewMine);
  const [busy, setBusy] = useState(false);

  async function build() {
    setBusy(true);
    try {
      const period = await preview();
      toast.success(`Report for ${period} is ready`);
    } catch (e) {
      toast.error((e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel>Reports</SectionLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Monthly growth reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">One consolidated report per completed calendar month, for every product you own. Emailed on the 1st around 09:00 local time.</p>
        </div>
        <Button variant="outline" size="sm" onClick={build} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Build last month now</Button>
      </div>
      {reports === undefined && <Skeleton className="h-40" />}
      {reports?.length === 0 && <Panel className="p-6 text-sm text-muted-foreground">No reports yet. The first one is generated on the 1st of next month — or build last month now.</Panel>}
      {reports?.map((r) => (
        <Link key={r._id} href={`/app/reports/${r.period}`} className="group block">
          <Panel className="flex items-center justify-between gap-4 p-4 transition-colors group-hover:border-line-strong">
            <div>
              <div className="font-medium">{r.payload.label}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{r.payload.projects.length} product{r.payload.projects.length === 1 ? "" : "s"} · <span className="text-pink">{formatDelta(r.payload.summary.totalNewUsers)}</span> users · {formatCompact(r.payload.summary.totalUsersEnd)} total{r.sentAt ? "" : " · scheduled"}</div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Panel>
        </Link>
      ))}
    </div>
  );
}
