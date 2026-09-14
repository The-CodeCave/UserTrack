import { describe, expect, it } from "vitest";
import { clientIp, isIp } from "./client-ip";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/badge/acme.svg", { headers });

// Header shapes captured on production (2026-09-14): Railway rewrites x-forwarded-for to "<peer>, <edge>" and x-real-ip to the client.
const VIA_CLOUDFLARE = { "x-real-ip": "92.0.2.10", "cf-connecting-ip": "92.0.2.10", "x-forwarded-for": "172.69.109.18, 152.233.13.166" };
const DIRECT_SPOOFED = { "x-real-ip": "92.0.2.10", "cf-connecting-ip": "203.0.113.33", "true-client-ip": "203.0.113.34", "x-forwarded-for": "92.0.2.10, 152.233.12.245" };

describe("clientIp", () => {
  it("keys on the address Railway's edge resolved, not its own edge hop", () => {
    expect(clientIp(req(VIA_CLOUDFLARE))).toBe("92.0.2.10");
    expect(clientIp(req({ ...VIA_CLOUDFLARE, "x-real-ip": "2001:db8::5" }))).toBe("2001:db8::5");
  });

  it("never reads cf-connecting-ip or true-client-ip, which reach the origin unfiltered", () => {
    expect(clientIp(req(DIRECT_SPOOFED))).toBe("92.0.2.10");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.1", "true-client-ip": "203.0.113.2" }))).toBe("unknown");
  });

  it("falls back to the last forwarded hop outside Railway, never the client-controlled first entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "evil, 198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(req({ "x-real-ip": "not an ip", "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(req({ "x-forwarded-for": "<script>" }))).toBe("unknown");
    expect(clientIp(req())).toBe("unknown");
  });

  it("isIp rejects junk", () => {
    expect(isIp("evil")).toBe(false);
    expect(isIp("")).toBe(false);
    expect(isIp("10.0.0.1")).toBe(true);
  });
});
