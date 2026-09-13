import { afterEach, expect, it, vi } from "vitest";
import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

afterEach(() => vi.unstubAllGlobals());

it("never forwards cf-connecting-ip to *.convex.site (Cloudflare rejects it with error 1000)", async () => {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("null"));
  vi.stubGlobal("fetch", fetchMock);
  const { handler } = convexBetterAuthNextJs({ convexUrl: "https://x.convex.cloud", convexSiteUrl: "https://x.convex.site" });
  await handler.GET(new Request("https://usertrack.dev/api/auth/get-session", { headers: { "cf-connecting-ip": "1.2.3.4", cookie: "a=b" } }));
  const sent = new Headers(fetchMock.mock.calls[0][1].headers);
  expect(sent.get("cf-connecting-ip")).toBeNull();
  expect(sent.get("cookie")).toBe("a=b");
});
