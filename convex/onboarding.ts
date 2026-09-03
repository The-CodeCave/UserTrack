// Live status for the "Set up with AI" flow, derived from the audit trail of the onboarding token and the project state.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProfile } from "./profiles";
import { projectSummary } from "./domain/projects";
import { integrationView, listIntegrations } from "./domain/integrations";

const EVENTS = new Set(["onboarding_ai_setup_selected", "manual_setup_selected", "mcp_setup_started", "agent_prompt_copied", "mcp_setup_completed", "platform_selected", "stack_selected"]);

// Lightweight funnel events, stored in the audit trail (no third-party analytics in the stack).
export const track = mutation({
  args: { event: v.string() },
  handler: async (ctx, { event }) => {
    if (!EVENTS.has(event)) return;
    const { profile } = await requireProfile(ctx);
    await ctx.db.insert("auditLogs", { profileId: profile._id, action: `event:${event}`, ok: true, at: Date.now() });
  },
});

export const agentSetupStatus = query({
  args: { tokenId: v.id("developerTokens") },
  handler: async (ctx, { tokenId }) => {
    const { profile } = await requireProfile(ctx);
    const token = await ctx.db.get(tokenId);
    if (!token || token.profileId !== profile._id) return null;
    const logs = await ctx.db.query("auditLogs").withIndex("by_token_time", (q) => q.eq("tokenId", tokenId)).order("desc").take(100);
    const created = logs.find((l) => l.action === "create_project" && l.ok && l.saasId);
    let saas = created?.saasId ? await ctx.db.get(created.saasId) : null;
    if (!saas) {
      const mine = await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", profile._id)).collect();
      saas = mine.filter((s) => s._creationTime >= token.createdAt - 60_000).sort((a, b) => b._creationTime - a._creationTime)[0] ?? null;
    }
    const integrations = saas ? (await listIntegrations(ctx, saas._id)).map(integrationView) : [];
    const users = integrations.find((i) => i.role === "users");
    const verified = logs.find((l) => l.action === "verify_integration" && l.ok);
    const flags = [
      { key: "agent", label: "Agent connected", done: token.lastUsedAt !== undefined, at: token.lastUsedAt },
      { key: "project", label: "UserTrack project created", done: Boolean(saas), at: saas?._creationTime },
      { key: "integration", label: users ? (users.provider === "native" ? `${users.label} integration created` : `Connecting ${users.label}`) : "Configuring data source", done: Boolean(users), at: users?.connectedAt },
      ...(users?.provider === "native" ? [{ key: "deploy", label: "SDK installed & deployed", done: !users.awaitingVerification, at: users.verifiedAt }] : []),
      { key: "verified", label: "Verifying data", done: Boolean(users && !users.awaitingVerification && (users.status === "ok" || verified)), at: users?.lastSuccessAt ?? verified?.at },
      { key: "sync", label: "First sync complete", done: saas?.lastSyncedAt !== undefined, at: saas?.lastSyncedAt },
      { key: "published", label: "Published", done: Boolean(saas?.isPublic), at: undefined },
    ];
    const firstPending = flags.findIndex((f) => !f.done);
    const steps = flags.map((f, i) => ({ ...f, state: f.done ? ("done" as const) : i === firstPending ? ("active" as const) : ("pending" as const) }));
    return {
      token: { id: token._id, name: token.name, prefix: token.prefix, lastUsedAt: token.lastUsedAt, createdAt: token.createdAt, revokedAt: token.revokedAt },
      project: saas ? projectSummary(saas) : null,
      integration: users ?? null,
      error: users?.status === "error" ? users.lastError : undefined,
      steps,
      done: flags.every((f) => f.done),
      lastActivityAt: logs[0]?.at ?? token.lastUsedAt,
      recent: logs.slice(0, 8).map((l) => ({ action: l.action, ok: l.ok, at: l.at, detail: l.detail })),
    };
  },
});
