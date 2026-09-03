// End-to-end: the real @usertrack/better-auth plugin (workspace source) running inside a real Better Auth instance,
// pulled by the real UserTrack provider — with fetch routed in-process. Proves both protocol twins agree.
import { afterEach, describe, expect, it, vi } from "vitest";
import { betterAuth as createBetterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { userTrack } from "../../packages/better-auth/src/index";
import { native as provider, type NativeStoredConfig } from "./native";

const PROJECT = "j57e2eproject";
const SECRET = "ut_int_e2e_secret_0123456789";
const BASE = "https://app.example.com";

function app() {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
  const auth = createBetterAuth({ baseURL: BASE, secret: "host-secret-0123456789abcdef", database: memoryAdapter(db), emailAndPassword: { enabled: true }, plugins: [userTrack({ projectId: PROJECT, secret: SECRET, events: false })] });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => auth.handler(new Request(url, init))));
  return { auth, db };
}
const cfg: NativeStoredConfig = { url: `${BASE}/api/auth`, source: "better-auth", secret: SECRET, secretHash: "", secretPrefix: "ut_int_e2e_", projectId: PROJECT, createdAt: 0 };
afterEach(() => vi.unstubAllGlobals());

describe("UserTrack ⇄ @usertrack/better-auth end to end", () => {
  it("pulls signed metrics from a live plugin after real signups", async () => {
    const { auth, db } = app();
    await auth.api.signUpEmail({ body: { email: "a@example.com", password: "password-1234", name: "A" } });
    await auth.api.signUpEmail({ body: { email: "b@example.com", password: "password-1234", name: "B" } });
    db.user!.push({ id: "old", email: "old@example.com", emailVerified: false, name: "Old", createdAt: new Date(Date.now() - 60 * 86_400_000), updatedAt: new Date() });
    const m = await provider.fetch(cfg, "users");
    expect(m).toMatchObject({ totalUsers: 3, newUsers24h: 2, newUsers7d: 2, newUsers30d: 2, protocolVersion: 1, reported: { roles: ["users"] } });
    expect(m.sourceVersion).toMatch(/^\d+\.\d+\.\d+/);
    const h = await provider.fetchHistory!(cfg, "users", 7);
    expect(h?.points).toHaveLength(7);
    expect(h?.points.at(-1)?.value).toBe(2);
  });
  it("fails clearly with the wrong secret and never affects the host app", async () => {
    const { auth } = app();
    await expect(provider.fetch({ ...cfg, secret: "ut_int_wrong" }, "users")).rejects.toThrow(/USERTRACK_SECRET/);
    const res = await auth.api.signUpEmail({ body: { email: "still@example.com", password: "password-1234", name: "S" } });
    expect(res.user.email).toBe("still@example.com");
  });
});
