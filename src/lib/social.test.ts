import { describe, expect, it } from "vitest";
import { displayXHandle, isValidXHandle, normalizeXHandle, xConnectionState, xHandleError, xIntentUrl, xProfileUrl } from "./social";

describe("normalizeXHandle", () => {
  it("accepts @name, name and profile URLs", () => {
    expect(normalizeXHandle("@aleksdoecode")).toBe("aleksdoecode");
    expect(normalizeXHandle("aleksdoecode")).toBe("aleksdoecode");
    expect(normalizeXHandle("  @@ada ")).toBe("ada");
    expect(normalizeXHandle("https://x.com/ada/")).toBe("ada");
    expect(normalizeXHandle("https://www.twitter.com/ada?s=20")).toBe("ada");
    expect(normalizeXHandle("http://mobile.twitter.com/Ada_1")).toBe("Ada_1");
    expect(normalizeXHandle("")).toBe("");
    expect(normalizeXHandle(undefined)).toBe("");
  });
  it("validates length and characters", () => {
    expect(isValidXHandle("ada")).toBe(true);
    expect(isValidXHandle("a".repeat(15))).toBe(true);
    expect(isValidXHandle("a".repeat(16))).toBe(false);
    expect(isValidXHandle("ada lovelace")).toBe(false);
    expect(isValidXHandle("ada-l")).toBe(false);
    expect(isValidXHandle("")).toBe(false);
  });
  it("produces form errors only for invalid values", () => {
    expect(xHandleError("")).toBeUndefined();
    expect(xHandleError("@ada")).toBeUndefined();
    expect(xHandleError("ada lovelace")).toMatch(/letters/);
    expect(xHandleError("a".repeat(20))).toMatch(/15/);
  });
  it("displays and links canonically", () => {
    expect(displayXHandle("@ada")).toBe("@ada");
    expect(xProfileUrl("https://x.com/ada")).toBe("https://x.com/ada");
    expect(xIntentUrl("hi there", "https://usertrack.dev/s/acme")).toBe("https://x.com/intent/post?text=hi+there&url=https%3A%2F%2Fusertrack.dev%2Fs%2Facme");
  });
  it("never upgrades a typed handle to a connected state", () => {
    expect(xConnectionState({ handle: "ada" })).toBe("handle_provided");
    expect(xConnectionState({ handle: "ada", connected: true })).toBe("connected_via_oauth");
    expect(xConnectionState({})).toBe("unavailable");
  });
});
