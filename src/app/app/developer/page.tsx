"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowUpRight, Sparkles, Webhook } from "lucide-react";
import { api } from "@convex/_generated/api";
import { PLANS } from "@convex/lib/tokens";
import { MCP_URL } from "@/lib/mcp/snippets";
import { SITE_URL } from "@/lib/site";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenList } from "@/components/app/developer/token-list";
import { CreateApiKeyDialog } from "@/components/app/developer/create-api-key-dialog";
import { CreateMcpTokenDialog } from "@/components/app/developer/create-mcp-token-dialog";
import { ActivityPanel, UsagePanel } from "@/components/app/developer/usage";

const LINKS = [
  { href: "/developers", label: "Docs" },
  { href: "/developers#api", label: "API reference" },
  { href: "/developers#mcp", label: "MCP" },
  { href: "/app/developer/webhooks", label: "Webhooks" },
  { href: "/api/openapi.json", label: "OpenAPI" },
];

const limits = PLANS.free;

export default function DeveloperPage() {
  const tokens = useQuery(api.tokens.list);
  const activity = useQuery(api.tokens.activity);
  const apiKeys = tokens?.filter((t) => t.type === "api") ?? [];
  const mcpTokens = tokens?.filter((t) => t.type === "mcp") ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <SectionLabel>Developer</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">API keys &amp; MCP tokens</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">Read public growth data programmatically, or let an AI coding agent set up and verify your projects through MCP.</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">{l.label} <ArrowUpRight className="size-3" /></a>
          ))}
        </div>
      </div>

      <Panel className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <SectionLabel>Public API</SectionLabel>
            <p className="mt-2 text-sm text-muted-foreground">Free. {limits.api.perDay.toLocaleString("en")} requests per day per key, bursts up to {limits.api.burstPerMinute}/min. Anonymous requests are limited to {limits.anonymous.burstPerMinute}/min per IP.</p>
          </div>
          <CreateApiKeyDialog />
        </div>
        <dl className="grid gap-2 font-mono text-[12px] sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-label">Base URL</dt><dd className="break-all">{SITE_URL}/api/v1</dd>
          <dt className="text-label">Header</dt><dd className="break-all">Authorization: Bearer ut_api_…</dd>
        </dl>
        {tokens === undefined ? <ListSkeleton /> : <TokenList tokens={apiKeys} empty="No API keys yet. Create one to call the API with a higher rate limit." />}
      </Panel>

      <Panel className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <SectionLabel>MCP</SectionLabel>
            <p className="mt-2 text-sm text-muted-foreground">Connect Claude Code, Cursor, Codex or any MCP client. Agents can create and configure projects, verify integrations and read metrics for you. {limits.mcp.perDay.toLocaleString("en")} calls per day per token.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="h-10" render={<Link href="/app/saas/new" />}><Sparkles className="size-4" /> Set up a project with AI</Button>
            <CreateMcpTokenDialog />
          </div>
        </div>
        <dl className="grid gap-2 font-mono text-[12px] sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-label">Endpoint</dt><dd className="break-all">{MCP_URL}</dd>
          <dt className="text-label">Header</dt><dd className="break-all">Authorization: Bearer ut_mcp_…</dd>
        </dl>
        <div className="border border-line bg-background/60 p-3 text-xs text-muted-foreground">
          <span className="text-label">Security</span>
          <p className="mt-1">Tokens are stored as SHA-256 hashes, scoped to what you allow, and revocable at any time. They can never delete projects or data. Keep them out of git and shared configs.</p>
        </div>
        {tokens === undefined ? <ListSkeleton /> : <TokenList tokens={mcpTokens} empty="No MCP tokens yet. Create one and paste the snippet into your coding agent." />}
      </Panel>

      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <SectionLabel>Webhooks</SectionLabel>
          <p className="mt-2 text-sm text-muted-foreground">Signed HTTP POSTs for milestones, rank changes, growth spikes and integration health. HMAC-SHA256, retries, delivery log.</p>
        </div>
        <Button variant="outline" className="h-10 shrink-0" render={<Link href="/app/developer/webhooks" />}><Webhook className="size-4" /> Manage webhooks</Button>
      </Panel>

      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionLabel>Usage</SectionLabel>
        {tokens === undefined ? <Skeleton className="h-16" /> : <UsagePanel tokens={tokens} />}
      </Panel>

      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionLabel>Recent activity</SectionLabel>
        {activity === undefined ? <ListSkeleton /> : <ActivityPanel rows={activity} />}
      </Panel>
    </div>
  );
}

function ListSkeleton() {
  return <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
}
