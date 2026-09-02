import { describe, expect, it } from "vitest";
import { userTrack, PLUGIN_VERSION } from "../src/index.js";
import pkg from "../package.json" with { type: "json" };

describe("plugin initialization", () => {
  it("requires projectId", () => {
    expect(() => userTrack({ projectId: "", secret: "x" })).toThrow(/projectId/);
    // @ts-expect-error missing option
    expect(() => userTrack({ secret: "x" })).toThrow(/projectId/);
  });
  it("requires secret", () => {
    expect(() => userTrack({ projectId: "p", secret: "  " })).toThrow(/secret/);
  });
  it("defaults the endpoint to usertrack.dev and enables events", () => {
    const p = userTrack({ projectId: "p", secret: "s" });
    expect(p.id).toBe("usertrack");
    expect(p.options.endpoint).toBe("https://usertrack.dev");
    expect(p.options.events).toBe(true);
    expect(p.version).toBe(PLUGIN_VERSION);
  });
  it("accepts a custom endpoint and strips the trailing slash", () => {
    expect(userTrack({ projectId: "p", secret: "s", endpoint: "https://ut.example.com/" }).options.endpoint).toBe("https://ut.example.com");
  });
  it("never exposes the secret on the plugin object", () => {
    const p = userTrack({ projectId: "p", secret: "ut_int_supersecret" });
    expect(JSON.stringify({ options: p.options, id: p.id })).not.toContain("supersecret");
  });
  it("reports the package version", () => {
    expect(PLUGIN_VERSION).toBe(pkg.version);
  });
});
