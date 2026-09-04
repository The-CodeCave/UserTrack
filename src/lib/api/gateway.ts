// Server-side bridge from a bearer token to the Convex gateway: hashing, quota check and error mapping.
import { createHash } from "node:crypto";
import { ConvexError } from "convex/values";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { looksLikeSecret, tokenTypeOf, type TokenType } from "@convex/lib/tokens";

export type GatewayCode = "unauthorized" | "revoked" | "expired" | "forbidden" | "rate_limited" | "not_found" | "bad_request" | "conflict" | "not_configured" | "upstream";
export interface GatewayFailure { code: GatewayCode; message: string; retryAfterSec?: number; requiredScope?: string; limit?: number; resetAt?: number }

export const STATUS: Record<GatewayCode, number> = { unauthorized: 401, revoked: 401, expired: 401, forbidden: 403, rate_limited: 429, not_found: 404, bad_request: 400, conflict: 409, not_configured: 501, upstream: 502 };

export const hashSecret = (secret: string) => createHash("sha256").update(secret, "utf8").digest("hex");

export function bearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return (m?.[1] ?? req.headers.get("x-api-key") ?? "").trim() || null;
}

// Auth payload every gateway function expects. The gateway secret proves the call comes from this Next.js server.
export function gatewayAuth(secret: string) {
  return { hash: hashSecret(secret), gateway: process.env.UT_GATEWAY_SECRET };
}

export function toFailure(e: unknown): GatewayFailure | null {
  if (e instanceof ConvexError && e.data && typeof e.data === "object" && "code" in e.data) return e.data as GatewayFailure;
  return null;
}

export type Authorized = Awaited<ReturnType<typeof authorize>>;

// Validates the secret shape locally, then lets Convex validate, count and rate-limit. Throws GatewayFailure-shaped ConvexErrors.
export async function authorize(secret: string, type: TokenType, category: string, scope?: string) {
  if (!looksLikeSecret(secret) || tokenTypeOf(secret) !== type) {
    throw new ConvexError({ code: "unauthorized", message: type === "mcp" ? "Invalid MCP token. Expected a token starting with ut_mcp_." : "Invalid API key. Expected a key starting with ut_api_." });
  }
  return fetchMutation(api.gateway.authorize, { auth: gatewayAuth(secret), type, scope, category });
}
