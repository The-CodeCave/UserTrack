import { afterEach, describe, expect, it, vi } from "vitest";

const fetchQuery = vi.fn();
vi.mock("convex/nextjs", () => ({ fetchQuery: (...args: unknown[]) => fetchQuery(...args) }));

const { GET } = await import("./route");
const call = (url = "http://localhost/api/health") => GET(new Request(url));

afterEach(() => { fetchQuery.mockReset(); vi.useRealTimers(); });

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

  it("reports convex: ok and the last job runs on ?deep=1", async () => {
    const jobs = [{ job: "daily sweep", startedAt: 1, finishedAt: 2, items: 10, errors: 0 }];
    fetchQuery.mockResolvedValueOnce({ saasCount: 3 }).mockResolvedValueOnce(jobs);
    const body = await (await call("http://localhost/api/health?deep=1")).json();
    expect(body).toMatchObject({ ok: true, convex: "ok", jobs });
  });

  it("stays 200 with convex: down when the read fails", async () => {
    fetchQuery.mockRejectedValue(new Error("unreachable"));
    const res = await call("http://localhost/api/health?deep=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, convex: "down" });
  });

  it("gives up on a hanging deployment after 3 seconds", async () => {
    vi.useFakeTimers();
    fetchQuery.mockReturnValue(new Promise(() => {}));
    const pending = call("http://localhost/api/health?deep=1");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await (await pending).json()).toMatchObject({ ok: true, convex: "down" });
  });
});
