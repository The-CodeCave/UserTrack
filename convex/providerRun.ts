// Runtime dispatch for provider fetches. Fetch-based providers run in the default (V8) runtime; database
// providers declare `runtime() === "node"` and are executed by convex/node/postgres.ts. Nothing else branches on kind.
import { ConvexError } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getProvider, ProviderError, type History, type ProviderMetrics, type Role } from "./providers";

function toProviderError(e: unknown): never {
  if (e instanceof ConvexError) {
    const d = e.data as { message?: string; retryable?: boolean } | string;
    if (typeof d === "string") throw new ProviderError(d, true);
    throw new ProviderError(d.message ?? "Provider error", d.retryable ?? true);
  }
  throw e;
}

export async function fetchMetrics(ctx: ActionCtx, kind: string, config: unknown, role: Role): Promise<ProviderMetrics> {
  const p = getProvider(kind);
  if (p.runtime?.(config) !== "node") return p.fetch(config, role);
  try {
    return await ctx.runAction(internal.node.postgres.fetch, { pg: p.toPostgres!(config, role), role });
  } catch (e) {
    return toProviderError(e);
  }
}

export async function fetchHistory(ctx: ActionCtx, kind: string, config: unknown, role: Role, days: number): Promise<History | null> {
  const p = getProvider(kind);
  if (p.runtime?.(config) !== "node") return p.fetchHistory ? p.fetchHistory(config, role, days) : null;
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
