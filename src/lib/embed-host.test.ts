import { describe, expect, it } from "vitest";
import { embedHost } from "./embed-host";
import { SITE_URL } from "./site";

describe("embedHost", () => {
  it("keeps the third-party host only", () => {
    expect(embedHost("https://www.Acme.io/pricing?x=1")).toBe("acme.io");
    expect(embedHost(`${SITE_URL}/s/acme`)).toBeNull();
    expect(embedHost("http://localhost:5173/")).toBeNull();
    expect(embedHost("not a url")).toBeNull();
    expect(embedHost(null)).toBeNull();
  });
});
