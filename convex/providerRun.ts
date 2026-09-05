// Runtime dispatch for provider fetches, and the single place stored credentials are decrypted (inline configs pass
// through untouched). Fetch-based providers run in the default (V8) runtime; database
// providers declare `runtime() === "node"` and are executed by convex/node/postgres.ts. Nothing else branches on kind.
import { ConvexError } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getProvider, ProviderError, type History, type ProviderMetrics, type Role } from "./providers";
import { BLOCKED_HOST_ERROR, resolvePublicHost } from "./lib/ssrf";
import { decryptConfig } from "./lib/secrets";

function toProviderError(e: unknown): never {
  if (e instanceof ConvexError) {
    const d = e.data as { message?: string; retryable?: boolean } | string;
    if (typeof d === "string") throw new ProviderError(d, true);
    throw new ProviderError(d.message ?? "Provider error", d.retryable ?? true);
  }
  throw e;
}

// Founder-supplied hosts are resolved right before the request; one generic error for every refusal (no port-scan oracle).
export async function assertPublicHosts(hosts: string[]) {
  for (const host of hosts) {
    if (!(await resolvePublicHost(host)).ok) throw new ProviderError(BLOCKED_HOST_ERROR, false);
  }
}

export async function fetchMetrics(ctx: ActionCtx, kind: string, storedConfig: unknown, role: Role): Promise<ProviderMetrics> {
  const p = getProvider(kind);
  const config = await decryptConfig(kind, storedConfig);
  if (p.runtime?.(config) !== "node") {
    await assertPublicHosts(p.hosts?.(config) ?? []);
    return p.fetch(config, role);
  }
  try {
    return await ctx.runAction(internal.node.postgres.fetch, { pg: p.toPostgres!(config, role), role });
  } catch (e) {
    return toProviderError(e);
  }
}

export async function fetchHistory(ctx: ActionCtx, kind: string, storedConfig: unknown, role: Role, days: number): Promise<History | null> {
  const p = getProvider(kind);
  const config = await decryptConfig(kind, storedConfig);
  if (p.runtime?.(config) !== "node") {
    if (!p.fetchHistory) return null;
    await assertPublicHosts(p.hosts?.(config) ?? []);
    return p.fetchHistory(config, role, days);
  }
  try {
    return await ctx.runAction(internal.node.postgres.fetchHistory, { pg: p.toPostgres!(config, role), role, days });
  } catch (e) {
    return toProviderError(e);
  }
}

export const hasHistory = (kind: string, config: unknown) => {
  const p = getProvider(kind);
  return p.runtime?.(config) === "node" ? Boolean(p.toPostgres) : Boolean(p.fetchHistory);
};
