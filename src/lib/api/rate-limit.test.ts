import { describe, expect, it } from "vitest";
import { LIMIT, take } from "./rate-limit";

describe("rate-limit", () => {
  it("allows LIMIT requests then denies", () => {
    const now = 1_000_000;
    for (let i = 0; i < LIMIT; i++) expect(take("a", now).allowed).toBe(true);
    const denied = take("a", now);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("refills one token per second", () => {
    const now = 2_000_000;
    for (let i = 0; i < LIMIT; i++) take("b", now);
    expect(take("b", now + 500).allowed).toBe(false);
    expect(take("b", now + 1_000).allowed).toBe(true);
    expect(take("b", now + 1_000).allowed).toBe(false);
    expect(take("b", now + 61_000).remaining).toBe(LIMIT - 1);
  });

  it("keys are independent", () => {
    const now = 3_000_000;
    for (let i = 0; i < LIMIT; i++) take("c", now);
    expect(take("c", now).allowed).toBe(false);
    expect(take("d", now).allowed).toBe(true);
  });
});
