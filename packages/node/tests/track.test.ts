import { describe, expect, it, vi } from "vitest";
import { EVENTS_PATH, HEADER_PROJECT, HEADER_SIGNATURE, verify } from "@usertrack/protocol";
import { buildEvent, createTracker, deliverEvent } from "../src/index.js";

const t = { endpoint: "https://usertrack.dev", projectId: "proj", secret: "ut_int_secret" };
const b = { projectId: "proj", secret: "ut_int_secret", source: "prisma" as const, clientVersion: "0.1.0" };

describe("lifecycle events", () => {
  it("builds a minimal, PII-free event", async () => {
    const e = await buildEvent(b, "user.activated", { id: "user_42", at: "2026-09-01T00:00:00Z" });
    expect(e).toMatchObject({ protocolVersion: 1, source: "prisma", clientVersion: "0.1.0", projectId: "proj", type: "user.activated", occurredAt: "2026-09-01T00:00:00.000Z" });
    expect(e.subject).toHaveLength(32);
    expect(JSON.stringify(e)).not.toContain("user_42");
    expect(Object.keys(e).sort()).toEqual(["clientVersion", "eventId", "occurredAt", "projectId", "protocolVersion", "source", "subject", "type"]);
    expect((await buildEvent(b, "user.created", { id: "x", at: "garbage" })).occurredAt).toMatch(/^20/);
  });
  it("posts a signed event to the native events path and resolves true on 2xx", async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`https://usertrack.dev${EVENTS_PATH}`);
      const h = new Headers(init?.headers);
      expect(h.get(HEADER_PROJECT)).toBe("proj");
      expect(h.get(HEADER_SIGNATURE)).toMatch(/^v1=[0-9a-f]{64}$/);
      expect(h.get("user-agent")).toMatch(/^usertrack-node\//);
      expect((await verify("ut_int_secret", h, { method: "REQUEST", path: EVENTS_PATH, body: String(init?.body) })).ok).toBe(true);
      return new Response("{}", { status: 202 });
    });
    expect(await deliverEvent({ ...t, fetch: fetch as unknown as typeof globalThis.fetch }, await buildEvent(b, "user.converted", { id: "u" }))).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("swallows network failures, rejections and timeouts; never logs the secret", async () => {
    const log = vi.fn();
    const e = await buildEvent(b, "user.created", { id: "u" });
    expect(await deliverEvent({ ...t, log, fetch: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof globalThis.fetch }, e)).toBe(false);
    expect(await deliverEvent({ ...t, log, fetch: (async () => new Response("nope", { status: 503 })) as unknown as typeof globalThis.fetch }, e)).toBe(false);
    const hang = (async (_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof globalThis.fetch;
    const started = Date.now();
    expect(await deliverEvent({ ...t, fetch: hang, timeoutMs: 20 }, e)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("ut_int_secret");
  });
  it("createTracker never throws from track() and ignores empty ids", async () => {
    const calls: string[] = [];
    const tracker = createTracker({ ...t, source: "authjs", fetch: (async (_u: unknown, init?: RequestInit) => { calls.push(JSON.parse(String(init?.body)).type); return new Response("{}", { status: 202 }); }) as unknown as typeof globalThis.fetch });
    expect(() => tracker.track("user.created", { id: "a" })).not.toThrow();
    expect(await tracker.deliver("trial.started", { id: "b" })).toBe(true);
    expect(await tracker.deliver("user.created", { id: "" })).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.sort()).toEqual(["trial.started", "user.created"]);
    expect(() => createTracker({ projectId: "", secret: "s" })).toThrow(/projectId/);
  });
});
