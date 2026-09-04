import { describe, expect, it, vi } from "vitest";
import { enabledProviders, fetchProviderHandle, socialProviderConfig, xUserInfo } from "./authProviders";

const all = { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs", GITHUB_CLIENT_ID: "h", GITHUB_CLIENT_SECRET: "hs", X_CLIENT_ID: "x", X_CLIENT_SECRET: "xs" };
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe("socialProviderConfig", () => {
  it("registers nothing without credentials", () => {
    expect(socialProviderConfig({})).toEqual({});
    expect(enabledProviders({})).toEqual({ google: false, github: false, twitter: false });
  });
  it("registers only providers whose id AND secret are set", () => {
    const cfg = socialProviderConfig({ GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs", GITHUB_CLIENT_ID: "h" });
    expect(Object.keys(cfg)).toEqual(["google"]);
    expect(cfg.google).toEqual({ clientId: "g", clientSecret: "gs" });
    expect(enabledProviders({ GITHUB_CLIENT_ID: "h" }).github).toBe(false);
  });
  it("reuses the X app credentials for the twitter provider with the strict user-info fetcher", () => {
    const cfg = socialProviderConfig(all);
    expect(Object.keys(cfg)).toEqual(["google", "github", "twitter"]);
    expect(cfg.github).toEqual({ clientId: "h", clientSecret: "hs" });
    expect(cfg.twitter).toMatchObject({ clientId: "x", clientSecret: "xs", getUserInfo: xUserInfo });
    expect(enabledProviders(all)).toEqual({ google: true, github: true, twitter: true });
  });
});

describe("xUserInfo", () => {
  it("returns a null email when X shares none instead of Better Auth's username fallback", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json({ data: { id: "1", name: "Ada", username: "ada", profile_image_url: "https://pbs.twimg.com/a_normal.jpg" } })).mockResolvedValueOnce(json({ title: "Forbidden" }, false));
    const info = await xUserInfo({ accessToken: "t" }, fetchFn);
    expect(info?.user).toEqual({ id: "1", name: "Ada", email: null, image: "https://pbs.twimg.com/a_400x400.jpg", emailVerified: false });
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer t");
    expect(fetchFn.mock.calls[1][0]).toContain("confirmed_email");
  });
  it("uses the confirmed email when the app has the email permission", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json({ data: { id: "1", username: "ada" } })).mockResolvedValueOnce(json({ data: { confirmed_email: "ada@example.com" } }));
    expect((await xUserInfo({ accessToken: "t" }, fetchFn))?.user).toMatchObject({ name: "ada", email: "ada@example.com", emailVerified: true });
  });
  it("returns null when the profile request fails", async () => {
    expect(await xUserInfo({ accessToken: "t" }, vi.fn().mockResolvedValue(json({}, false)))).toBeNull();
  });
});

describe("fetchProviderHandle", () => {
  it("maps the GitHub login and avatar", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ login: "ada", avatar_url: "https://avatars.githubusercontent.com/u/1" }));
    expect(await fetchProviderHandle("github", "t", fetchFn)).toEqual({ github: "ada", avatarUrl: "https://avatars.githubusercontent.com/u/1" });
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.github.com/user");
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer t");
  });
  it("maps the X username and avatar", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ data: { id: "1", username: "ada", profile_image_url: "https://pbs.twimg.com/a_normal.jpg" } }));
    expect(await fetchProviderHandle("twitter", "t", fetchFn)).toEqual({ x: "ada", avatarUrl: "https://pbs.twimg.com/a_400x400.jpg" });
  });
  it("returns null on provider errors", async () => {
    expect(await fetchProviderHandle("github", "t", vi.fn().mockResolvedValue(json({}, false)))).toBeNull();
    expect(await fetchProviderHandle("twitter", "t", vi.fn().mockResolvedValue(json({ errors: [] })))).toBeNull();
  });
});
