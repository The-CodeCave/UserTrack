import { describe, expect, it, vi } from "vitest";
import { assertPublicDbHost, explain } from "./postgres";

const resolving = (...addresses: string[]) => vi.fn(async () => addresses.map((address) => ({ address })));

describe("assertPublicDbHost", () => {
  it("rejects hosts that resolve to private, loopback, link-local or ULA addresses without connecting", async () => {
    for (const addrs of [["10.0.0.5"], ["93.184.216.34", "192.168.0.2"], ["127.0.0.1"], ["169.254.169.254"], ["fd12::1"], ["fe80::1"], ["::1"], []]) {
      await expect(assertPublicDbHost("db.acme.com", resolving(...addrs), {}), addrs.join()).rejects.toMatchObject({ code: "UT_PRIVATE_HOST" });
    }
  });

  it("accepts public answers and public IP literals; checks literals and blocked names without DNS", async () => {
    await expect(assertPublicDbHost("db.acme.com", resolving("93.184.216.34", "2606:4700::1111"), {})).resolves.toBeUndefined();
    const lookup = resolving("93.184.216.34");
    await expect(assertPublicDbHost("93.184.216.34", lookup, {})).resolves.toBeUndefined();
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "[::1]", "2130706433", "db.internal", "pg.railway.internal"]) {
      await expect(assertPublicDbHost(host, lookup, {}), host).rejects.toMatchObject({ code: "UT_PRIVATE_HOST" });
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("UT_ALLOW_PRIVATE_DB=1 lifts the check for local development only", async () => {
    const lookup = resolving("127.0.0.1");
    await expect(assertPublicDbHost("localhost", lookup, { UT_ALLOW_PRIVATE_DB: "1" })).resolves.toBeUndefined();
    await expect(assertPublicDbHost("localhost", lookup, { UT_ALLOW_PRIVATE_DB: "true" })).rejects.toMatchObject({ code: "UT_PRIVATE_HOST" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("maps the refusal to one generic, actionable, non-retryable message", () => {
    const out = explain(Object.assign(new Error("private host postgresql://ro:hunter2@10.0.0.5/app"), { code: "UT_PRIVATE_HOST" }));
    expect(out).toEqual({ message: expect.stringMatching(/^blocked: private or internal address — .*pooler\)$/), retryable: false });
    expect(out.message).not.toContain("hunter2");
  });
});
