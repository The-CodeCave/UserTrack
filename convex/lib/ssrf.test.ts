import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allPublic, canonicalIpv4, checkPublicHttpsUrl, isBlockedHost, isPrivateIp, ownHosts, resolvePublicHost } from "./ssrf";

const ENV = { SITE_URL: "https://usertrack.dev", CONVEX_SITE_URL: "https://handsome-warthog-21.convex.site", CONVEX_CLOUD_URL: "https://handsome-warthog-21.convex.cloud" };

beforeEach(() => Object.assign(process.env, ENV));
afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("canonicalIpv4 / isPrivateIp", () => {
  it("normalizes decimal, hex, octal and shorthand IPv4 literals", () => {
    expect(canonicalIpv4("2130706433")).toBe("127.0.0.1");
    expect(canonicalIpv4("0x7f000001")).toBe("127.0.0.1");
    expect(canonicalIpv4("0177.0.0.1")).toBe("127.0.0.1");
    expect(canonicalIpv4("127.1")).toBe("127.0.0.1");
    expect(canonicalIpv4("0xa.0.0.1")).toBe("10.0.0.1");
    expect(canonicalIpv4("example.com")).toBeNull();
    expect(canonicalIpv4("256.1.1.1")).toBeNull();
    expect(canonicalIpv4("4294967296")).toBeNull();
  });

  it("flags every private, loopback, link-local, metadata and unspecified range", () => {
    for (const ip of ["10.0.0.1", "172.16.5.5", "172.31.255.255", "192.168.1.1", "192.0.0.8", "127.0.0.1", "127.255.255.255", "169.254.169.254", "0.0.0.0", "100.64.1.1", "100.127.255.255", "198.18.0.1", "224.0.0.1", "255.255.255.255", "2130706433", "0x7f000001", "0xa000001", "::1", "::", "[::1]", "fe80::1", "fd12::1", "fc00::", "ff02::1", "::ffff:10.0.0.1", "::ffff:a00:1", "::ffff:7f00:1", "64:ff9b::a00:1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("accepts public addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "100.128.0.1", "172.32.0.1", "192.169.0.1", "2606:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808"]) expect(isPrivateIp(ip), ip).toBe(false);
    expect(allPublic(["8.8.8.8", "2606:4700::1111"])).toBe(true);
    expect(allPublic(["8.8.8.8", "10.0.0.1"])).toBe(false);
    expect(allPublic([])).toBe(false);
  });
});

describe("isBlockedHost / ownHosts", () => {
  it("collects the hostnames of this deployment from the environment", () => {
    expect([...ownHosts()]).toEqual(["usertrack.dev", "handsome-warthog-21.convex.site", "handsome-warthog-21.convex.cloud"]);
    expect([...ownHosts({ SITE_URL: "not a url" })]).toEqual([]);
  });

  it("blocks internal names, our own hosts, *.convex.cloud and private literals — case-insensitively", () => {
    for (const h of ["localhost", "LOCALHOST", "api.internal", "foo.local", "db.lan", "metadata.google.internal", "metadata", "instance-data", "kubernetes.default.svc", "usertrack.railway.internal", "x.convex.cloud", "usertrack.dev", "USERTRACK.DEV.", "handsome-warthog-21.convex.site", "10.0.0.1", "[::1]", "2130706433"]) {
      expect(isBlockedHost(h), h).toBe(true);
    }
    for (const h of ["app.example.com", "eu.posthog.com", "other-deployment.convex.site", "8.8.8.8", "[2606:4700::1111]"]) expect(isBlockedHost(h), h).toBe(false);
    expect(isBlockedHost("other-deployment.convex.site", [".convex.site"])).toBe(true);
  });
});

describe("checkPublicHttpsUrl", () => {
  it("accepts public https URLs on standard ports, any port when allowed", () => {
    expect(checkPublicHttpsUrl("  https://eu.posthog.com/ ")).toEqual({ ok: true, url: "https://eu.posthog.com/", host: "eu.posthog.com" });
    expect(checkPublicHttpsUrl("https://eu.posthog.com:8443").ok).toBe(true);
    expect(checkPublicHttpsUrl("https://eu.posthog.com:8000")).toEqual({ ok: false, reason: "Only ports 443 and 8443 are allowed" });
    expect(checkPublicHttpsUrl("https://app.example.com:8000/api", { anyPort: true }).ok).toBe(true);
    expect(checkPublicHttpsUrl("https://93.184.216.34/x").ok).toBe(true);
  });

  it("rejects http, credentials, garbage, bare names, internal names and our own hosts", () => {
    expect(checkPublicHttpsUrl("http://app.example.com", { what: "The endpoint URL" })).toEqual({ ok: false, reason: "The endpoint URL must use https://" });
    expect(checkPublicHttpsUrl("https://user:pw@app.example.com")).toEqual({ ok: false, reason: "Credentials in the URL are not allowed" });
    expect(checkPublicHttpsUrl("")).toEqual({ ok: false, reason: "Enter a URL" });
    expect(checkPublicHttpsUrl("nope")).toEqual({ ok: false, reason: "Not a valid URL" });
    expect(checkPublicHttpsUrl("https://intranet/x")).toEqual({ ok: false, reason: "Use a fully qualified public hostname" });
    for (const bad of ["https://localhost:8443/x", "https://api.internal/x", "https://usertrack.dev/api/v1/saas", "https://handsome-warthog-21.convex.site/x", "https://x.convex.cloud/x", "https://metadata.google.internal/computeMetadata"]) {
      expect(checkPublicHttpsUrl(bad, { anyPort: true })).toEqual({ ok: false, reason: "Internal or local hostnames are not allowed" });
    }
  });

  it("rejects private IP literals in every spelling the URL parser accepts", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "0.0.0.0", "[::1]", "[fe80::1]", "[::ffff:10.0.0.1]", "2130706433", "0x7f000001", "0177.0.0.1", "127.1", "0xA9FEA9FE"]) {
      expect(checkPublicHttpsUrl(`https://${ip}/x`, { anyPort: true })).toEqual({ ok: false, reason: "Private, loopback, link-local and metadata addresses are not allowed" });
    }
  });
});

describe("resolvePublicHost", () => {
  const doh = (answers: Record<string, string[]>) =>
    vi.fn(async (url: string) => {
      const u = new URL(url);
      const list = answers[u.searchParams.get("type")!] ?? [];
      return Response.json({ Answer: list.map((data) => ({ type: u.searchParams.get("type") === "A" ? 1 : 28, data })) });
    });

  it("short-circuits blocked names and IP literals without touching DNS", async () => {
    const fetch = doh({});
    vi.stubGlobal("fetch", fetch);
    expect(await resolvePublicHost("localhost")).toEqual({ ok: false, reason: "blocked address" });
    expect(await resolvePublicHost("10.0.0.1")).toEqual({ ok: false, reason: "blocked address" });
    expect(await resolvePublicHost("8.8.8.8")).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves A + AAAA over DoH and refuses any private answer or an empty answer", async () => {
    vi.stubGlobal("fetch", doh({ A: ["93.184.216.34"], AAAA: ["2606:2800:220:1:248:1893:25c8:1946"] }));
    expect(await resolvePublicHost("app.example.com")).toEqual({ ok: true });
    vi.stubGlobal("fetch", doh({ A: ["93.184.216.34", "10.0.0.5"] }));
    expect(await resolvePublicHost("rebind.example.com")).toEqual({ ok: false, reason: "host resolves to a private or internal address" });
    vi.stubGlobal("fetch", doh({}));
    expect(await resolvePublicHost("nx.example.com")).toEqual({ ok: false, reason: "host did not resolve" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("resolver down"); }));
    expect(await resolvePublicHost("app.example.com")).toEqual({ ok: false, reason: "host did not resolve" });
  });
});
