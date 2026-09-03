import { afterEach, describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { constantTimeEqual, gatewayMatches, requireGateway } from "./gateway";

const SECRET = "0123456789abcdef0123456789abcdef";
afterEach(() => { delete process.env.UT_GATEWAY_SECRET; });

describe("constantTimeEqual", () => {
  it("compares full strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("gateway secret", () => {
  it("accepts only the exact configured secret", () => {
    process.env.UT_GATEWAY_SECRET = SECRET;
    expect(gatewayMatches(SECRET)).toBe(true);
    expect(gatewayMatches(SECRET.slice(0, -1) + "0")).toBe(false);
    expect(gatewayMatches("")).toBe(false);
    expect(gatewayMatches(undefined)).toBe(false);
    expect(() => requireGateway(SECRET)).not.toThrow();
    expect(() => requireGateway("wrong")).toThrow(ConvexError);
  });

  it("fails closed when the env var is missing", () => {
    expect(gatewayMatches(undefined)).toBe(false);
    expect(gatewayMatches("anything")).toBe(false);
    let data: { code: string; message: string } | undefined;
    try { requireGateway(undefined); } catch (e) { data = (e as ConvexError<{ code: string; message: string }>).data; }
    expect(data).toEqual({ code: "unauthorized", message: "Gateway secret not configured" });
  });
});
