import { describe, expect, it } from "vitest";
import { buildCohorts, identityQualityOf, subjectHash } from "./identity";

const DAY = 86_400_000;
const T = Date.UTC(2026, 7, 1);

describe("subjectHash", () => {
  it("is deterministic per project and never contains the raw id", async () => {
    const a = await subjectHash("salt", "saas1", "user_123");
    const b = await subjectHash("salt", "saas1", " user_123 ");
    const c = await subjectHash("salt", "saas2", "user_123");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
    expect(a).not.toContain("user_123");
  });
});

describe("identityQualityOf", () => {
  it("aggregate_only without signup or downstream links", () => {
    expect(identityQualityOf({ signupLinks: 0, signupsInPeriod: 100, downstreamLinks: 10, downstreamMatched: 10 }).quality).toBe("aggregate_only");
    expect(identityQualityOf({ signupLinks: 100, signupsInPeriod: 100, downstreamLinks: 0, downstreamMatched: 0 }).quality).toBe("aggregate_only");
  });
  it("cohort_verified needs coverage ≥ 80%, match ≥ 70% and ≥ 20 subjects", () => {
    expect(identityQualityOf({ signupLinks: 90, signupsInPeriod: 100, downstreamLinks: 20, downstreamMatched: 16 })).toEqual({ quality: "cohort_verified", coveragePct: 72 });
    expect(identityQualityOf({ signupLinks: 50, signupsInPeriod: 100, downstreamLinks: 20, downstreamMatched: 20 }).quality).toBe("partially_mapped");
    expect(identityQualityOf({ signupLinks: 100, signupsInPeriod: 100, downstreamLinks: 20, downstreamMatched: 5 }).quality).toBe("partially_mapped");
    expect(identityQualityOf({ signupLinks: 10, signupsInPeriod: 10, downstreamLinks: 5, downstreamMatched: 5 }).quality).toBe("partially_mapped");
  });
});

describe("buildCohorts", () => {
  it("groups by signup month with D7 activation and D30 conversion", () => {
    const signups = new Map([["a", T], ["b", T + 2 * DAY], ["c", T + 40 * DAY], ["d", T + 5 * DAY]]);
    const activated = new Map([["a", T + 3 * DAY], ["b", T + 10 * DAY], ["zzz", T]]);
    const converted = new Map([["a", T + 20 * DAY], ["b", T + 45 * DAY]]);
    const rows = buildCohorts(signups, { activated, converted });
    expect(rows.map((r) => r.cohort)).toEqual(["2026-08", "2026-09"]);
    expect(rows[0]).toMatchObject({ signedUp: 3, activated: 2, activatedD7: 1, converted: 2, convertedD30: 1, medianTimeToActivationMs: 3 * DAY, medianTimeToConversionMs: 20 * DAY });
    expect(rows[1]).toMatchObject({ signedUp: 1, activated: 0, converted: 0, medianTimeToActivationMs: undefined });
  });
  it("ignores duplicate / unmatched downstream subjects and empty input", () => {
    expect(buildCohorts(new Map(), { converted: new Map([["x", T]]) })).toEqual([]);
  });
});
