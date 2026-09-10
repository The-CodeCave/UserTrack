import { describe, expect, it } from "vitest";
import { activationDeltaAt } from "./chart-series";

describe("activationDeltaAt", () => {
  const points = [{ activated: 10 }, { activated: 13 }, {}, { activated: 18 }, { activated: 16 }];

  it("derives newly activated users from consecutive cumulative snapshots", () => {
    expect(activationDeltaAt(points, 0)).toBeNull();
    expect(activationDeltaAt(points, 1)).toBe(3);
  });

  it("does not bridge missing data and preserves source corrections", () => {
    expect(activationDeltaAt(points, 2)).toBeNull();
    expect(activationDeltaAt(points, 3)).toBeNull();
    expect(activationDeltaAt(points, 4)).toBe(-2);
  });
});
