import { describe, expect, it } from "vitest";
import { formatCompact, formatDelta, formatPct, timeAgo } from "./format";

describe("format", () => {
  it("compacts large numbers only", () => {
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(9_999)).toBe("9,999");
    expect(formatCompact(12_345)).toBe("12.3K");
    expect(formatCompact(1_500_000)).toBe("1.5M");
  });
  it("formats deltas with sign", () => {
    expect(formatDelta(0)).toBe("±0");
    expect(formatDelta(42)).toBe("+42");
    expect(formatDelta(-42)).toBe("−42");
  });
  it("formats percentages", () => {
    expect(formatPct(12.345)).toBe("+12.3%");
    expect(formatPct(-3)).toBe("-3.0%");
  });
  it("time ago", () => {
    const now = 1_000_000_000;
    expect(timeAgo(now - 30_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe("3d ago");
  });
});
