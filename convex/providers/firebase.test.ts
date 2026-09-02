import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FIREBASE_SCAN_LIMIT, firebase } from "./firebase";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const urls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => String(c[0]));
const DAY = 86_400_000;

let serviceAccount = "";
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const private_key = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  serviceAccount = JSON.stringify({ client_email: "sa@proj.iam.gserviceaccount.com", private_key, project_id: "proj-1" });
});
afterEach(() => vi.unstubAllGlobals());

// Token endpoint → "t"; accounts:query → recordsCount; accounts:batchGet pages twice via nextPageToken.
function stub(recordsCount: number, createdAt: number[]) {
  const [page1, page2] = [createdAt.slice(0, 2), createdAt.slice(2)];
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "t" });
    if (url.includes("accounts:query")) return json({ recordsCount });
    if (url.includes("accounts:batchGet")) return json(url.includes("nextPageToken=p2") ? { users: page2.map((t) => ({ createdAt: String(t) })) } : { users: page1.map((t) => ({ createdAt: String(t) })), nextPageToken: "p2" });
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("firebase", () => {
  it("fetch computes signup windows from createdAt", async () => {
    const now = Date.now();
    const fetchMock = stub(4, [now - 3_600_000, now - 3 * DAY, now - 20 * DAY, now - 40 * DAY]);
    expect(await firebase.fetch({ serviceAccount, projectId: "proj-1" }, "users")).toEqual({ totalUsers: 4, newUsers24h: 1, newUsers7d: 2, newUsers30d: 3 });
    const u = urls(fetchMock);
    expect(u[1]).toBe("https://identitytoolkit.googleapis.com/v1/projects/proj-1/accounts:query");
    expect(u.filter((x) => x.includes("accounts:batchGet"))).toHaveLength(2);
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toEqual({ Authorization: "Bearer t" });
  });

  it("skips the scan above FIREBASE_SCAN_LIMIT", async () => {
    const fetchMock = stub(FIREBASE_SCAN_LIMIT + 1, [Date.now()]);
    expect(await firebase.fetch({ serviceAccount, projectId: "proj-1" }, "users")).toEqual({ totalUsers: FIREBASE_SCAN_LIMIT + 1 });
    expect(urls(fetchMock).some((x) => x.includes("batchGet"))).toBe(false);
    expect(await firebase.fetchHistory!({ serviceAccount, projectId: "proj-1" }, "users", 7)).toBeNull();
  });

  it("scanSignups:false disables the scan", async () => {
    const fetchMock = stub(3, [Date.now()]);
    expect(await firebase.fetch({ serviceAccount, projectId: "proj-1", scanSignups: false }, "users")).toEqual({ totalUsers: 3 });
    expect(urls(fetchMock).some((x) => x.includes("batchGet"))).toBe(false);
    expect(firebase.publicConfig({ serviceAccount, projectId: "proj-1", scanSignups: false }).signups).toBe("snapshot deltas");
  });

  it("fetchHistory returns days+1 daily newUsers points", async () => {
    const now = Date.now();
    const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) + 1000;
    stub(3, [today, today, now - 2 * DAY, now - 10 * DAY]);
    const h = await firebase.fetchHistory!({ serviceAccount, projectId: "proj-1" }, "users", 3);
    expect(h?.metric).toBe("newUsers");
    expect(h?.points).toHaveLength(4);
    expect(h?.points.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day))).toBe(true);
    expect(h?.points.reduce((a, p) => a + p.value, 0)).toBe(3);
    expect(h?.points[3].value).toBe(2);
  });
});
