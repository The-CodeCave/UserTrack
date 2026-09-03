import { describe, expect, it, vi } from "vitest";
import { sendServerEvent } from "./analytics-server";

const base = { host: "https://rybbit.example", siteId: "site1", hostname: "usertrack.dev", pathname: "/api/v1/leaderboard" };

describe("sendServerEvent", () => {
  it("posts a custom_event with JSON-string properties and the bearer key", async () => {
    const f = vi.fn(async () => Response.json({ success: true }));
    await sendServerEvent({ ...base, apiKey: "rb_key", event: "api_request", props: { category: "leaderboard", status: 200, authenticated: false }, userId: "u1" }, f);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rybbit.example/api/track");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rb_key");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ site_id: "site1", type: "custom_event", hostname: "usertrack.dev", pathname: "/api/v1/leaderboard", event_name: "api_request", user_id: "u1" });
    expect(JSON.parse(body.properties)).toEqual({ category: "leaderboard", status: 200, authenticated: "false" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the Authorization header and properties when absent", async () => {
    const f = vi.fn(async () => new Response(null));
    await sendServerEvent({ ...base, event: "native_event_ingested" }, f);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(init.body as string);
    expect(body.properties).toBeUndefined();
    expect(body.user_id).toBeUndefined();
  });

  it("never throws when the endpoint is down", async () => {
    const f = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    await expect(sendServerEvent({ ...base, event: "badge_rendered", props: { type: "users" } }, f)).resolves.toBeUndefined();
  });
});
