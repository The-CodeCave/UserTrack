import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "../src/index.js";
import pkg from "../package.json" with { type: "json" };

describe("package", () => {
  it("reports the package version", () => expect(SDK_VERSION).toBe(pkg.version));
});
