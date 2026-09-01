import { describe, expect, it } from "vitest";
import { isValidHandle, slugify } from "./slug";

describe("slug", () => {
  it("slugifies", () => {
    expect(slugify("  Hello World!  ")).toBe("hello-world");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
    expect(slugify("a".repeat(60))).toHaveLength(40);
  });
  it("validates handles", () => {
    expect(isValidHandle("aleks")).toBe(true);
    expect(isValidHandle("a")).toBe(false);
    expect(isValidHandle("-bad")).toBe(false);
    expect(isValidHandle("app")).toBe(false);
  });
});
