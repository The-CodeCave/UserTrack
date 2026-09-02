import { describe, expect, it, vi } from "vitest";
import { buildEvent, deliverEvent } from "../src/events.js";
import { HEADER_PROJECT, HEADER_SIGNATURE, verify } from "../src/protocol.js";

const t = { endpoint: "https://usertrack.dev", projectId: "proj", secret: "ut_int_secret" };

describe("lifecycle events", () => {
  it("builds a minimal, PII-free user.created event", async () => {
    const e = await buildEvent(t, "user.created", "user_42", new Date("2026-09-01T00:00:00Z"));
    expect(e).toMatchObject({ protocolVersion: 1, provider: "better-auth", projectId: "proj", type: "user.created", occurredAt: "2026-09-01T00:00:00.000Z" });
    expect(e.eventId).toMatch(/[0-9a-f-]{32,36}/);
    expect(e.subject).toHaveLength(32);
    expect(JSON.stringify(e)).not.toContain("user_42");
    expect(Object.keys(e).sort()).toEqual(["eventId", "occurredAt", "pluginVersion", "projectId", "protocolVersion", "provider", "subject", "type"]);
  });
  it("posts a signed event and resolves true on 2xx", async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://usertrack.dev/api/integrations/better-auth/events");
      const h = new Headers(init?.headers);
      expect(h.get(HEADER_PROJECT)).toBe("proj");
      expect(h.get(HEADER_SIGNATURE)).toMatch(/^v1=[0-9a-f]{64}$/);
      expect(h.get("user-agent")).toMatch(/^usertrack-better-auth\//);
      const ok = await verify("ut_int_secret", h, { method: "REQUEST", path: "/api/integrations/better-auth/events", body: String(init?.body) });
      expect(ok.ok).toBe(true);
      return new Response("{}", { status: 202 });
    });
    const e = await buildEvent(t, "user.deleted", "u", new Date());
    expect(await deliverEvent({ ...t, fetch: fetch as unknown as typeof globalThis.fetch }, e)).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("swallows network failures and rejections", async () => {
    const log = vi.fn();
    const e = await buildEvent(t, "user.created", "u", new Date());
    expect(await deliverEvent({ ...t, log, fetch: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof globalThis.fetch }, e)).toBe(false);
    expect(await deliverEvent({ ...t, log, fetch: (async () => new Response("nope", { status: 503 })) as unknown as typeof globalThis.fetch }, e)).toBe(false);
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("ut_int_secret");
  });
  it("aborts after the timeout", async () => {
    const e = await buildEvent(t, "user.created", "u", new Date());
    const fetch = (async (_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof globalThis.fetch;
    const started = Date.now();
    expect(await deliverEvent({ ...t, fetch, timeoutMs: 20 }, e)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
