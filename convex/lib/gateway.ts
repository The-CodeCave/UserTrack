// Shared gateway-secret check for every function the Next.js server calls on behalf of an anonymous caller.
// Fails CLOSED: a missing UT_GATEWAY_SECRET rejects every call, so a misconfigured deployment cannot expose the gateway.
import { ConvexError } from "convex/values";

// Length check first, then a fixed-cost XOR over every character, so timing does not leak the mismatch position.
export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function gatewayMatches(provided?: string) {
  const expected = process.env.UT_GATEWAY_SECRET;
  return Boolean(expected && provided) && constantTimeEqual(provided!, expected!);
}

export function requireGateway(provided?: string) {
  if (!gatewayMatches(provided)) throw new ConvexError({ code: "unauthorized", message: process.env.UT_GATEWAY_SECRET ? "Gateway secret mismatch" : "Gateway secret not configured" });
}
