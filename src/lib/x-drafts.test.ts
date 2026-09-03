import { describe, expect, it } from "vitest";
import { fitsX, xDraft, type DraftInput, type DraftKind } from "./x-drafts";

const base: DraftInput = { kind: "users", name: "Acme", value: 10_000, newUsers30d: 1842, verified: true, seed: "m1" };

describe("xDraft", () => {
  it("uses real numbers and the verified attribution", () => {
    const d = xDraft(base);
    expect(d).toContain("10,000");
    expect(d).toContain("+1,842 in the last 30 days.");
    expect(d.endsWith("Verified by @usertrack")).toBe(true);
  });
  it("never claims verification for self-reported data", () => {
    expect(xDraft({ ...base, verified: false }).endsWith("Tracked on @usertrack")).toBe(true);
    expect(xDraft({ ...base, verified: false, author: "usertrack" })).not.toMatch(/verified/i);
  });
  it("UserTrack-authored posts speak in third person and only tag the founder when a handle is passed", () => {
    const tagged = xDraft({ ...base, author: "usertrack", founderHandle: "ada" });
    expect(tagged).toContain("Acme");
    expect(tagged).not.toContain("We ");
    expect(tagged).toContain("Built by @ada");
    expect(xDraft({ ...base, author: "usertrack" })).not.toContain("Built by");
  });
  it("prefers the product handle over the name when known", () => {
    expect(xDraft({ ...base, author: "usertrack", projectHandle: "acmeapp" })).toContain("@acmeapp");
  });
  it("rotates templates by seed but stays deterministic", () => {
    const a = xDraft({ ...base, seed: "a" });
    const b = xDraft({ ...base, seed: "b" });
    const c = xDraft({ ...base, seed: "c" });
    expect(xDraft({ ...base, seed: "a" })).toBe(a);
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
  it("covers every kind within the X limit", () => {
    const kinds: DraftKind[] = ["users", "activated", "converted", "best_day", "best_week", "rank", "top10", "top100", "streak", "monthly_growth", "trending_top10", "spike", "benchmark", "growth", "week", "trending", "activation", "conversion", "founder"];
    for (const kind of kinds) {
      const d = xDraft({ ...base, kind, rank: 3, growth30dPct: 42.4, percentile: 92, category: "AI", title: "activation rate", projectCount: 4, totalUsers: 28481, name: "A very long product name indeed" });
      expect(d.length, kind).toBeGreaterThan(10);
      expect(fitsX(d), kind).toBe(true);
    }
  });
});
