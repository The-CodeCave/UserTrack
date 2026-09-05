import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { proxy } from "./proxy";

process.env.NEXT_PUBLIC_CONVEX_SITE_URL = "https://test.convex.site";

const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
const now = () => Math.floor(Date.now() / 1000);
const req = (path: string, cookie?: string) => new NextRequest(`http://localhost:3100${path}`, { headers: { ...(cookie ? { cookie } : {}), "x-forwarded-for": "203.0.113.5" } });
const location = (res: Response) => res.headers.get("location");
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("proxy route guard", () => {
  it("lets a live convex_jwt cookie through without a round trip", async () => {
    const res = await proxy(req("/app", `better-auth.session_token=s; better-auth.convex_jwt=${jwt(now() + 600)}`));
    expect(location(res)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the __Secure- prefixed cookies production sets", async () => {
    const res = await proxy(req("/app", `__Secure-better-auth.session_token=s; __Secure-better-auth.convex_jwt=${jwt(now() + 600)}`));
    expect(location(res)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects a visitor without a session cookie to /sign-in?next=", async () => {
    const res = await proxy(req("/app/saas/abc"));
    expect(location(res)).toBe("http://localhost:3100/sign-in?next=%2Fapp%2Fsaas%2Fabc");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Better Auth for a token with the trusted client IP stamped when the jwt is expired", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: "t" }), { status: 200 }));
    const cookie = `better-auth.session_token=s; better-auth.convex_jwt=${jwt(now() - 600)}`;
    const res = await proxy(req("/app", cookie));
    expect(location(res)).toBeNull();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://test.convex.site/api/auth/convex/token");
    const headers = init!.headers as Record<string, string>;
    expect(headers[CLIENT_IP_HEADER]).toBe("203.0.113.5");
    expect(headers.cookie).toBe(cookie);
  });

  it("redirects when Better Auth says the session is gone", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const res = await proxy(req("/app", "better-auth.session_token=stale"));
    expect(location(res)).toBe("http://localhost:3100/sign-in?next=%2Fapp");
  });

  it("fails open on a 429 or an unreachable Convex instead of bouncing a signed-in founder", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Too many", { status: 429 }));
    expect(location(await proxy(req("/app", "better-auth.session_token=s")))).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(location(await proxy(req("/app", "better-auth.session_token=s")))).toBeNull();
    expect(location(await proxy(req("/sign-in", "better-auth.session_token=s")))).toBeNull();
  });

  it("sends a signed-in founder from the auth pages to /app", async () => {
    const res = await proxy(req("/sign-in", `better-auth.session_token=s; better-auth.convex_jwt=${jwt(now() + 600)}`));
    expect(location(res)).toBe("http://localhost:3100/app");
  });
});
