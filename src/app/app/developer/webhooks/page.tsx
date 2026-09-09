"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowUpRight } from "lucide-react";
import { api } from "@convex/_generated/api";
import { DISABLE_AFTER_FAILURES, MAX_ATTEMPTS, SIGNATURE_TOLERANCE_SEC, WEBHOOK_TIMEOUT_MS } from "@convex/lib/webhooks";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateWebhookDialog } from "@/components/app/developer/webhooks/create-webhook-dialog";
import { EndpointList } from "@/components/app/developer/webhooks/endpoint-list";

const LINKS = [
  { href: "/app/developer", label: "API keys & MCP" },
  { href: "/developers/webhooks", label: "Webhook docs" },
  { href: "/developers/webhooks#signature", label: "Signature verification" },
];

const HEADERS = [
  ["UserTrack-Signature", "v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>"],
  ["UserTrack-Timestamp", `unix seconds · reject if older than ${SIGNATURE_TOLERANCE_SEC / 60} min`],
  ["UserTrack-Event", "event type, e.g. milestone.reached"],
  ["UserTrack-Delivery", "dlv_… unique per attempt series (also Idempotency-Key)"],
  ["UserTrack-Event-Id", "evt_… same across endpoints; dedupe on it"],
];

export default function WebhooksPage() {
  const data = useQuery(api.webhooks.list);
  return (
    <div className="app-page space-y-6">
      <div>
        <SectionLabel><Link href="/app/developer" className="hover:text-foreground">Developer</Link> · Webhooks</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">Get a signed HTTP POST the moment one of your projects hits a milestone, moves on a board, spikes, or a data source fails and recovers.</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">{l.label} <ArrowUpRight className="size-3" /></Link>
          ))}
        </div>
      </div>

      <Panel className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <SectionLabel>Endpoints</SectionLabel>
            <p className="mt-2 text-sm text-muted-foreground">{data ? `${data.endpoints.length} of ${data.maxEndpoints} endpoints.` : "Up to 10 endpoints."} Each has its own signing secret and event subscription; scope one to a single project or receive everything.</p>
          </div>
          <CreateWebhookDialog projects={data?.projects ?? []} disabled={!data || data.endpoints.length >= data.maxEndpoints} />
        </div>
        {data === undefined ? <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : <EndpointList data={data} />}
      </Panel>

      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionLabel>How signing works</SectionLabel>
        <dl className="grid gap-2 font-mono text-[12px] sm:grid-cols-[auto_1fr] sm:gap-x-4">
          {HEADERS.map(([k, v]) => <div key={k} className="contents"><dt className="text-label">{k}</dt><dd className="break-all">{v}</dd></div>)}
        </dl>
        <div className="border border-line bg-background/60 p-3 text-xs text-muted-foreground">
          <span className="text-label">Retry policy</span>
          <p className="mt-1">{MAX_ATTEMPTS} attempts — immediately, then after 5 min, 30 min, 2 h and 12 h — on 5xx, 408, 425, 429, network errors and timeouts ({WEBHOOK_TIMEOUT_MS / 1000} s). Any other 4xx is final. Endpoints that fail {DISABLE_AFTER_FAILURES} deliveries in a row are disabled until you re-enable them here.</p>
        </div>
        <p className="text-xs text-muted-foreground">Full reference, payload examples and verification samples in Node and Python: <Link href="/developers/webhooks" className="font-mono underline underline-offset-4">/developers/webhooks</Link>.</p>
      </Panel>
    </div>
  );
}
