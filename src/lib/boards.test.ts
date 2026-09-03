import { describe, expect, it } from "vitest";
import { boardWindows, defaultWindow, periodLabel } from "./boards";

describe("boards", () => {
  it("weekly boards default to 7d", () => {
    expect(defaultWindow("trending")).toBe("7d");
    expect(defaultWindow("hidden-gems")).toBe("7d");
    expect(defaultWindow("movers")).toBe("30d");
    expect(defaultWindow("fastest")).toBe("30d");
  });
  it("collapses the window switch for fixed-window boards", () => {
    expect(boardWindows("hidden-gems")).toEqual(["7d"]);
    expect(boardWindows("movers")).toEqual(["30d"]);
    expect(boardWindows("best-conversion")).toEqual(["30d"]);
    expect(boardWindows("fastest")).toEqual(["24h", "7d", "30d"]);
  });
  it("labels archive periods", () => {
    expect(periodLabel("2026-08")).toBe("August 2026");
    expect(periodLabel("2025-12")).toBe("December 2025");
  });
});
