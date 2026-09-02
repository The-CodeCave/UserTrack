import { describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { sha256Hex } from "@convex/lib/tokens";

const { fetchMutation } = vi.hoisted(() => ({ fetchMutation: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchMutation }));

import { authorize, bearer, hashSecret, STATUS, toFailure } from "./gateway";

describe("hashSecret", () => {
  it("matches the Convex-side sha256Hex for every input (hash equality is what makes tokens resolvable)", () => {
    for (const input of ["", "abc", "ut_api_" + "x".repeat(40), "ut_mcp_" + "Zz09_".repeat(8), "ü€ unicode ✓", "a".repeat(1000)]) {
      expect(hashSecret(input)).toBe(sha256Hex(input));
    }
  });
});

describe("bearer", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost/api/v1/x", { headers });

  it("parses Authorization: Bearer", () => {
    expect(bearer(req({ authorization: "Bearer ut_api_abc" }))).toBe("ut_api_abc");
    expect(bearer(req({ authorization: "bearer   ut_api_abc  " }))).toBe("ut_api_abc");
  });

  it("falls back to X-API-Key", () => {
    expect(bearer(req({ "x-api-key": " ut_api_key " }))).toBe("ut_api_key");
  });

  it("returns null when nothing is sent or the scheme is wrong", () => {
    expect(bearer(req({}))).toBeNull();
    expect(bearer(req({ authorization: "Basic abc" }))).toBeNull();
    expect(bearer(req({ authorization: "Bearer " }))).toBeNull();
  });
});

describe("toFailure", () => {
  it("maps a ConvexError carrying a code", () => {
    const f = toFailure(new ConvexError({ code: "rate_limited", message: "slow down", retryAfterSec: 30 }));
    expect(f).toEqual({ code: "rate_limited", message: "slow down", retryAfterSec: 30 });
    expect(STATUS[f!.code]).toBe(429);
  });

  it("returns null for plain errors and ConvexErrors without a code", () => {
    expect(toFailure(new Error("boom"))).toBeNull();
    expect(toFailure(new ConvexError("string payload"))).toBeNull();
    expect(toFailure(new ConvexError({ reason: "x" }))).toBeNull();
    expect(toFailure(undefined)).toBeNull();
  });
});

describe("authorize", () => {
  const failure = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return toFailure(e);
    }
    throw new Error("expected failure");
  };

  it("rejects malformed secrets locally without calling Convex", async () => {
    fetchMutation.mockClear();
    expect((await failure(authorize("ut_api_short", "api", "saas")))?.code).toBe("unauthorized");
    expect((await failure(authorize("sk_live_" + "a".repeat(40), "api", "saas")))?.code).toBe("unauthorized");
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it("rejects a well-formed secret of the wrong type without calling Convex", async () => {
    fetchMutation.mockClear();
    const f = await failure(authorize("ut_api_" + "a".repeat(40), "mcp", "usertrack_get_projects", "projects:read"));
    expect(f?.code).toBe("unauthorized");
    expect(f?.message).toMatch(/ut_mcp_/);
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it("forwards the hash, type, scope and category to the gateway mutation", async () => {
    fetchMutation.mockClear().mockResolvedValueOnce({ limit: { perDay: 5000, usedToday: 1, remaining: 4999, resetAt: 0 } });
    const secret = "ut_mcp_" + "b".repeat(40);
    await authorize(secret, "mcp", "usertrack_get_projects", "projects:read");
    expect(fetchMutation).toHaveBeenCalledTimes(1);
    expect(fetchMutation.mock.calls[0][1]).toEqual({ auth: { hash: sha256Hex(secret), gateway: undefined }, type: "mcp", scope: "projects:read", category: "usertrack_get_projects" });
  });
});
