import { describe, expect, it, vi } from "vitest";
import { EVENTS_PATH, HEADER_PROJECT, HEADER_SIGNATURE, verify } from "@usertrack/protocol";
import { betterAuthTracker } from "../src/events.js";
import { PLUGIN_VERSION } from "../src/version.js";

const t = { endpoint: "https://usertrack.dev", projectId: "proj", secret: "ut_int_secret" };

describe("lifecycle events", () => {
  it("posts a signed, PII-free event identified as the Better Auth plugin", async () => {
    let body: Record<string, unknown> | null = null;
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`https://usertrack.dev${EVENTS_PATH}`);
      const h = new Headers(init?.headers);
      expect(h.get(HEADER_PROJECT)).toBe("proj");
      expect(h.get(HEADER_SIGNATURE)).toMatch(/^v1=[0-9a-f]{64}$/);
      expect((await verify("ut_int_secret", h, { method: "REQUEST", path: EVENTS_PATH, body: String(init?.body) })).ok).toBe(true);
      body = JSON.parse(String(init?.body));
      return new Response("{}", { status: 202 });
    });
    expect(await betterAuthTracker({ ...t, fetch: fetch as unknown as typeof globalThis.fetch }).deliver("user.created", { id: "user_42", at: new Date("2026-09-01T00:00:00Z") })).toBe(true);
    expect(body).toMatchObject({ protocolVersion: 1, source: "better-auth", clientVersion: PLUGIN_VERSION, projectId: "proj", type: "user.created", occurredAt: "2026-09-01T00:00:00.000Z" });
    expect(JSON.stringify(body)).not.toContain("user_42");
    expect(body!.subject).toHaveLength(32);
  });
  it("swallows network failures and never logs the secret", async () => {
    const log = vi.fn();
    const tracker = betterAuthTracker({ ...t, debug: log, fetch: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof globalThis.fetch });
    expect(await tracker.deliver("user.deleted", { id: "u" })).toBe(false);
    expect(() => tracker.track("user.deleted", { id: "u" })).not.toThrow();
    expect(JSON.stringify(log.mock.calls)).not.toContain("ut_int_secret");
  });
});
