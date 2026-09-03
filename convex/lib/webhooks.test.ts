import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, WEBHOOK_EVENT_TYPES, allPublic, buildPayload, checkWebhookUrl, eventIdFor, generateWebhookSecret, isPrivateIp, maskSecret, nextAttemptDelay, serializePayload, signPayload, signatureHeaders } from "./webhooks";

describe("checkWebhookUrl (SSRF policy)", () => {
  it("accepts public https URLs and normalizes them", () => {
    const r = checkWebhookUrl("  https://hooks.example.com/usertrack?x=1 ");
    expect(r).toEqual({ ok: true, url: "https://hooks.example.com/usertrack?x=1", host: "hooks.example.com" });
    expect(checkWebhookUrl("https://8.8.8.8/hook").ok).toBe(true);
  });

  it("rejects http, credentials, garbage and internal names", () => {
    for (const bad of ["", "not a url", "http://hooks.example.com/x", "ftp://example.com", "https://user:pw@example.com/x", "https://localhost/x", "https://LOCALHOST:8443/x", "https://api.internal/x", "https://foo.local/x", "https://metadata.google.internal/computeMetadata", "https://usertrack.railway.internal/x", "https://handsome-warthog-21.convex.site/x", "https://intranet/x"]) {
      expect(checkWebhookUrl(bad).ok, bad).toBe(false);
    }
  });

  it("rejects private, loopback, link-local and metadata IP literals", () => {
    for (const ip of ["10.0.0.1", "172.16.5.5", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.169.254", "0.0.0.0", "100.64.1.1", "224.0.0.1", "[::1]", "[fe80::1]", "[fd12::1]", "[::ffff:10.0.0.1]"]) {
      expect(checkWebhookUrl(`https://${ip}/hook`).ok, ip).toBe(false);
    }
    expect(checkWebhookUrl("https://172.32.0.1/hook").ok).toBe(true);
  });
});

describe("isPrivateIp / allPublic", () => {
  it("classifies DNS answers so rebinding to a private range is refused at delivery time", () => {
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("64:ff9b::a00:1")).toBe(true);
    expect(allPublic(["1.1.1.1", "10.0.0.1"])).toBe(false);
    expect(allPublic(["1.1.1.1", "2606:4700::1111"])).toBe(true);
    expect(allPublic([])).toBe(false);
  });
});

describe("secrets + signing", () => {
  it("generates whsec_ secrets and masks them", () => {
    const { secret, prefix } = generateWebhookSecret((n) => new Uint8Array(n).map((_, i) => i));
    expect(secret.startsWith("whsec_")).toBe(true);
    expect(secret.length).toBe(6 + 32);
    expect(prefix).toBe(secret.slice(0, 10));
    expect(maskSecret(prefix)).toBe(`${prefix}••••••••••••••••`);
  });

  it("signs `${timestamp}.${body}` with HMAC-SHA256 (documented test vector)", async () => {
    const sig = await signPayload("whsec_test", 1700000000, '{"id":"evt_1","type":"webhook.test"}');
    expect(sig).toBe("v1=684fbc8999ff13aa332102c10e23ad56af8cb3b34c5d3bcba8bf53317e5f6c33");
    expect(await signPayload("whsec_test", 1700000000, '{"id":"evt_1","type":"webhook.test"}')).toBe(sig);
    expect(await signPayload("whsec_other", 1700000000, '{"id":"evt_1","type":"webhook.test"}')).not.toBe(sig);
    expect(await signPayload("whsec_test", 1700000001, '{"id":"evt_1","type":"webhook.test"}')).not.toBe(sig);
  });

  it("emits the documented headers", () => {
    const h = signatureHeaders({ signature: "v1=abc", timestamp: 1700000000, type: "milestone.reached", deliveryId: "dlv_1", eventId: "evt_1" });
    expect(h["UserTrack-Signature"]).toBe("v1=abc");
    expect(h["UserTrack-Timestamp"]).toBe("1700000000");
    expect(h["UserTrack-Event"]).toBe("milestone.reached");
    expect(h["UserTrack-Delivery"]).toBe("dlv_1");
    expect(h["Idempotency-Key"]).toBe("dlv_1");
    expect(h["Content-Type"]).toBe("application/json");
  });
});

describe("retry policy", () => {
  it("is immediate, 5m, 30m, 2h, 12h and then stops", () => {
    expect(RETRY_DELAYS_MS).toEqual([0, 300_000, 1_800_000, 7_200_000, 43_200_000]);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(nextAttemptDelay(1)).toBe(300_000);
    expect(nextAttemptDelay(4)).toBe(43_200_000);
    expect(nextAttemptDelay(5)).toBeNull();
  });
});

describe("payloads", () => {
  it("are versioned, deterministic per source event and marked when they are tests", () => {
    expect(eventIdFor("milestone.reached", "abc:users:10000")).toBe("evt_milestone_reached_abc_users_10000");
    const p = buildPayload({ id: "evt_1", type: "milestone.reached", createdAt: Date.UTC(2026, 8, 3), project: { id: "p", slug: "acme", name: "Acme", url: "https://usertrack.dev/s/acme", totalUsers: 10000 }, data: { milestone: { value: 10000 } } });
    expect(p).toEqual({ id: "evt_1", type: "milestone.reached", apiVersion: "2026-09-01", createdAt: "2026-09-03T00:00:00.000Z", data: { project: { id: "p", slug: "acme", name: "Acme", url: "https://usertrack.dev/s/acme", totalUsers: 10000 }, milestone: { value: 10000 } } });
    expect(buildPayload({ id: "evt_t", type: "webhook.test", createdAt: 0, test: true, data: {} }).test).toBe(true);
    expect(serializePayload(p)).toBe(JSON.stringify(p));
    expect(WEBHOOK_EVENT_TYPES).not.toContain("webhook.test");
    expect(WEBHOOK_EVENT_TYPES.length).toBe(7);
  });
});
