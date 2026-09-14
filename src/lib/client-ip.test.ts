import { afterEach, describe, expect, it } from "vitest";
import { clientIp, isCloudflareIp, isIp } from "./client-ip";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/badge/acme.svg", { headers });
const trustCf = (on: boolean) => { if (on) process.env.UT_TRUST_CF_HEADERS = "1"; else delete process.env.UT_TRUST_CF_HEADERS; };

afterEach(() => trustCf(false));

describe("clientIp", () => {
  it("takes a single forwarded IP", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("uses the LAST hop, never the client-controlled first entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "evil, 198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2 , 3.3.3.3" }))).toBe("3.3.3.3");
  });

  it("accepts IPv6 literals", () => {
    expect(clientIp(req({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(req({ "x-forwarded-for": "::ffff:203.0.113.7" }))).toBe("::ffff:203.0.113.7");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(req({ "x-forwarded-for": "not an ip", "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(req({ "x-forwarded-for": "<script>" }))).toBe("unknown");
    expect(clientIp(req())).toBe("unknown");
  });

  it("ignores Cloudflare headers unless UT_TRUST_CF_HEADERS=1", () => {
    const headers = { "cf-connecting-ip": "203.0.113.1", "true-client-ip": "203.0.113.2", "x-forwarded-for": "198.51.100.9" };
    expect(clientIp(req(headers))).toBe("198.51.100.9");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.1" }))).toBe("unknown");
  });

  it("prefers cf-connecting-ip once Cloudflare is trusted and the last hop is a Cloudflare address", () => {
    trustCf(true);
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "evil, 172.70.12.4" }))).toBe("203.0.113.1");
    expect(clientIp(req({ "cf-connecting-ip": "2001:db8::5", "x-forwarded-for": "2606:4700:3033::6815:524" }))).toBe("2001:db8::5");
  });

  it("ignores a spoofed Cloudflare header sent straight to the origin", () => {
    trustCf(true);
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(req({ "true-client-ip": "203.0.113.2", "x-forwarded-for": "172.70.12.4, 198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.1" }))).toBe("unknown");
  });

  it("falls through to true-client-ip, then the last hop, when the Cloudflare header is absent or junk", () => {
    trustCf(true);
    expect(clientIp(req({ "true-client-ip": "203.0.113.2", "x-forwarded-for": "162.158.1.1" }))).toBe("203.0.113.2");
    expect(clientIp(req({ "cf-connecting-ip": "<script>", "x-forwarded-for": "162.158.1.1" }))).toBe("162.158.1.1");
    expect(clientIp(req({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(req())).toBe("unknown");
  });

  it("isCloudflareIp matches the published ranges only", () => {
    for (const ip of ["173.245.48.1", "104.16.0.0", "104.23.255.255", "172.71.255.255", "::ffff:162.159.0.1", "2606:4700::1", "2a06:98c7:ffff::1", "2400:CB00:1::"]) expect(isCloudflareIp(ip)).toBe(true);
    for (const ip of ["104.32.0.0", "172.72.0.0", "92.209.200.195", "36.0.203.0", "2a06:98c8::1", "2001:db8::1", "::1", "evil", "1:2:3:4:5:6:7:8:9"]) expect(isCloudflareIp(ip)).toBe(false);
  });

  it("isIp rejects junk", () => {
    expect(isIp("evil")).toBe(false);
    expect(isIp("")).toBe(false);
    expect(isIp("10.0.0.1")).toBe(true);
  });
});
