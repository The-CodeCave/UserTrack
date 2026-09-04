import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchQuery = vi.fn();
vi.mock("convex/nextjs", () => ({ fetchQuery: (...args: unknown[]) => fetchQuery(...args) }));

const { GET } = await import("./route");
const call = (url = "http://localhost/api/health") => GET(new Request(url));

beforeEach(() => { process.env.UT_GATEWAY_SECRET = "test-gateway-secret"; });
afterEach(() => { fetchQuery.mockReset(); vi.useRealTimers(); delete process.env.UT_GATEWAY_SECRET; });

describe("GET /api/health", () => {
  it("answers without touching Convex", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, version: expect.any(String) });
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.convex).toBeUndefined();
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it("reports convex: ok and the last job runs on ?deep=1, with the lock state per job", async () => {
    const jobs = [
      { job: "daily sweep", startedAt: 1, finishedAt: 2, items: 10, errors: 0, running: false, stale: false },
      { job: "weekly digest", startedAt: 3, items: 4, errors: 0, running: true, stale: true },
    ];
    fetchQuery.mockResolvedValueOnce({ saasCount: 3 }).mockResolvedValueOnce(jobs);
    const body = await (await call("http://localhost/api/health?deep=1")).json();
    expect(body).toMatchObject({ ok: true, convex: "ok", jobs });
  });

  it("keeps convex: ok when only the gateway secret is missing", async () => {
    delete process.env.UT_GATEWAY_SECRET;
    fetchQuery.mockResolvedValueOnce({ saasCount: 3 });
    const body = await (await call("http://localhost/api/health?deep=1")).json();
    expect(body).toMatchObject({ ok: true, convex: "ok", jobs: "unavailable: gateway secret not configured" });
    expect(fetchQuery).toHaveBeenCalledTimes(1);
  });

  it("stays 200 with convex: down when the read fails", async () => {
    fetchQuery.mockRejectedValue(new Error("unreachable"));
    const res = await call("http://localhost/api/health?deep=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, convex: "down", jobs: "unavailable: jobs.health did not answer" });
  });

  it("gives up on a hanging deployment after 3 seconds", async () => {
    vi.useFakeTimers();
    fetchQuery.mockReturnValue(new Promise(() => {}));
    const pending = call("http://localhost/api/health?deep=1");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await (await pending).json()).toMatchObject({ ok: true, convex: "down" });
  });
});
