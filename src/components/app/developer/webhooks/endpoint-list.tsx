"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, KeyRound, Loader2, RotateCw, Send } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip } from "../token-list";
import { SecretReveal, errMsg } from "../copy-block";
import { track } from "@/lib/analytics";

type List = FunctionReturnType<typeof api.webhooks.list>;
type Endpoint = List["endpoints"][number];
type Delivery = FunctionReturnType<typeof api.webhooks.deliveries>[number];

// "in 5m" for a future timestamp (timeAgo with the arguments swapped).
const untilLabel = (ts: number) => (ts <= Date.now() ? "now" : `in ${timeAgo(Date.now(), ts).replace(" ago", "").replace("just now", "<1m")}`);
const STATUS_CLS: Record<string, string> = { success: "border-pink/40 text-pink", failed: "border-destructive/60 text-destructive", exhausted: "border-destructive/60 text-destructive", pending: "border-line-strong text-foreground" };

export function EndpointList({ data }: { data: List }) {
  if (data.endpoints.length === 0) return <div className="border border-dashed border-line p-6 text-center text-sm text-muted-foreground">No endpoints yet. Add one to receive milestones, rank changes and spikes as signed HTTP POSTs.</div>;
  const projectName = (id?: Id<"saas">) => data.projects.find((p) => p.id === id)?.name;
  return <div className="divide-y divide-line border border-line">{data.endpoints.map((ep) => <EndpointRow key={ep.id} ep={ep} project={projectName(ep.saasId)} maxAttempts={data.maxAttempts} />)}</div>;
}

function EndpointRow({ ep, project, maxAttempts }: { ep: Endpoint; project?: string; maxAttempts: number }) {
  const update = useMutation(api.webhooks.update);
  const rotate = useMutation(api.webhooks.rotateSecret);
  const remove = useMutation(api.webhooks.remove);
  const sendTest = useMutation(api.webhooks.sendTest);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "rotate" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const active = ep.status === "active";

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <div className={cn("space-y-3 p-4", !active && "bg-background/40")}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-sm">{ep.url}</span>
            <Chip className={cn("uppercase tracking-wider", active && "border-pink/40 text-pink")}>{ep.status}</Chip>
            {project ? <Chip>{project}</Chip> : <Chip>all projects</Chip>}
          </div>
          {ep.description && <div className="text-sm text-muted-foreground">{ep.description}</div>}
          {!active && ep.disabledReason && <div className="text-xs text-destructive">{ep.disabledReason}</div>}
          <div className="flex flex-wrap gap-1">{ep.events.map((e) => <Chip key={e}>{e}</Chip>)}</div>
          <div className="tabular font-mono text-[11px] text-muted-foreground">
            {ep.secretMasked} · created {formatDate(ep.createdAt)} · last delivery {ep.lastDeliveryAt ? `${timeAgo(ep.lastDeliveryAt)}${ep.lastStatus ? ` (HTTP ${ep.lastStatus})` : ""}` : "never"}
            {ep.consecutiveFailures > 0 && <span className="text-destructive"> · {ep.consecutiveFailures} consecutive failures</span>}
          </div>
          {ep.lastError && <div className="truncate font-mono text-[11px] text-destructive">{ep.lastError}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {confirm === "delete" ? (
            <>
              <Button variant="destructive" size="sm" className="h-10 sm:h-8" disabled={busy !== null} onClick={() => run("delete", () => remove({ id: ep.id }), "Endpoint deleted")}>Confirm delete</Button>
              <Button variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setConfirm(null)}>Cancel</Button>
            </>
          ) : confirm === "rotate" ? (
            <>
              <Button variant="destructive" size="sm" className="h-10 sm:h-8" disabled={busy !== null} onClick={() => run("rotate", async () => setSecret((await rotate({ id: ep.id })).secret), "Secret rotated — update your consumer")}>Confirm rotate</Button>
              <Button variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setConfirm(null)}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="h-10 sm:h-8" disabled={busy !== null || !active} onClick={() => run("test", async () => { await sendTest({ id: ep.id }); track("webhook_test_sent"); }, "Test event queued")}>{busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send test</Button>
              <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => setShowDeliveries((v) => !v)}>Deliveries {showDeliveries ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}</Button>
              <Button variant="outline" size="sm" className="h-10 sm:h-8" disabled={busy !== null} onClick={() => run("status", () => update({ id: ep.id, status: active ? "disabled" : "active" }), active ? "Endpoint disabled" : "Endpoint enabled")}>{active ? "Disable" : "Enable"}</Button>
              <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => setConfirm("rotate")}><KeyRound className="size-3.5" /> Rotate secret</Button>
              <Button variant="ghost" size="sm" className="h-10 text-destructive sm:h-8" onClick={() => setConfirm("delete")}>Delete</Button>
            </>
          )}
        </div>
      </div>
      {secret && <div className="space-y-2"><SecretReveal secret={secret} /><Button variant="ghost" size="sm" onClick={() => setSecret(null)}>Hide</Button></div>}
      {showDeliveries && <Deliveries id={ep.id} maxAttempts={maxAttempts} />}
    </div>
  );
}

function Deliveries({ id, maxAttempts }: { id: Id<"webhookEndpoints">; maxAttempts: number }) {
  const [failedOnly, setFailedOnly] = useState(false);
  const rows = useQuery(api.webhooks.deliveries, { id, limit: 25, failedOnly });
  return (
    <div className="border border-line bg-background/60">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-label">Recent deliveries</span>
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"><input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} className="accent-pink" /> failed only</label>
      </div>
      {rows === undefined ? (
        <div className="p-3 font-mono text-[11px] text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-3 font-mono text-[11px] text-muted-foreground">No deliveries yet. Send a test event to see one here.</div>
      ) : (
        <div className="divide-y divide-line">
          <div className="hidden grid-cols-[10rem_6rem_4rem_4rem_5rem_1fr_auto] gap-x-3 px-3 py-1.5 text-label md:grid"><span>Event</span><span>Status</span><span>Attempt</span><span>HTTP</span><span>Latency</span><span>When</span><span /></div>
          {rows.map((d) => <DeliveryRow key={d.id} d={d} maxAttempts={maxAttempts} />)}
        </div>
      )}
    </div>
  );
}

function DeliveryRow({ d, maxAttempts }: { d: Delivery; maxAttempts: number }) {
  const retry = useMutation(api.webhooks.retry);
  const [busy, setBusy] = useState(false);
  const retryable = d.status === "failed" || d.status === "exhausted";
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 font-mono text-[11px] md:grid-cols-[10rem_6rem_4rem_4rem_5rem_1fr_auto] md:items-center">
      <span className="col-span-2 break-all md:col-span-1" title={`${d.deliveryId} · ${d.eventId}`}>{d.type}</span>
      <span><Chip className={cn("uppercase tracking-wider", STATUS_CLS[d.status])}>{d.status}</Chip></span>
      <span className="text-muted-foreground">{d.attempt}/{maxAttempts}</span>
      <span className="text-muted-foreground">{d.httpStatus ?? "—"}</span>
      <span className="text-muted-foreground">{d.latencyMs !== undefined ? `${d.latencyMs} ms` : "—"}</span>
      <span className="col-span-2 min-w-0 text-muted-foreground md:col-span-1">
        {timeAgo(d.lastAttemptAt ?? d.createdAt)}
        {d.status === "pending" && d.nextAttemptAt ? ` · next retry ${untilLabel(d.nextAttemptAt)}` : ""}
        {d.error && <span className="block truncate text-destructive">{d.error}</span>}
      </span>
      <span className="col-span-2 md:col-span-1">
        {retryable && <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={async () => { setBusy(true); try { await retry({ deliveryId: d.id }); toast.success("Retry queued"); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); } }}><RotateCw className="size-3" /> Retry</Button>}
      </span>
    </div>
  );
}
