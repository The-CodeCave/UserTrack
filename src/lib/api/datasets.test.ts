import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, DATASETS, csvEscape, csvFilename, datasetRow, decodeCursor, encodeCursor, methodologyUrl, page, parseDatasetParams, toCsv } from "./datasets";

const CATS = new Set(["ai", "developer-tools"]);
const params = (qs: string) => parseDatasetParams(new URLSearchParams(qs), CATS);

describe("csv", () => {
  it("escapes commas, quotes and line breaks and leaves plain values alone", () => {
    expect(csvEscape("Acme")).toBe("Acme");
    expect(csvEscape(12)).toBe("12");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvEscape('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvEscape("two\nlines")).toBe('"two\nlines"');
    expect(csvEscape(true)).toBe("true");
  });

  it("writes a header row and CRLF-terminated rows in column order", () => {
    const row = datasetRow({ slug: "acme", name: "Acme, Inc", totalUsers: 10, newUsers24h: 1, newUsers7d: 2, newUsers30d: 3, trust: "verified", lastSyncedAt: Date.UTC(2026, 8, 1) }, 1, "https://ut.dev");
    const out = toCsv([row], CSV_COLUMNS);
    const lines = out.split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines[1]).toBe('1,acme,"Acme, Inc",,web,10,1,2,3,,,,,,,,,verified,true,2026-09-01T00:00:00.000Z,https://ut.dev/s/acme');
    expect(lines[2]).toBe("");
    expect(csvFilename("trending", new Date(Date.UTC(2026, 8, 3)))).toBe("usertrack-trending-2026-09-03.csv");
  });

  it("flattens only public fields into a dataset row", () => {
    const row = datasetRow({ slug: "a", name: "A", totalUsers: 1, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, trust: "unverified", rank: 4, rank7dAgo: 9, rankDelta7d: 5, ownerId: "x", config: { k: 1 } } as never, 3, "https://ut.dev");
    expect(row).toEqual({ position: 3, slug: "a", name: "A", category: undefined, projectType: "web", totalUsers: 1, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, growth7dPct: undefined, growth30dPct: undefined, activationRatePct: undefined, trendingRank: undefined, trendingScore7d: undefined, rank: 4, rank7dAgo: 9, rankDelta7d: 5, trust: "unverified", verified: false, lastSyncedAt: undefined, url: "https://ut.dev/s/a" });
    expect(Object.keys(row)).toEqual(CSV_COLUMNS);
  });
});

describe("cursor", () => {
  it("round-trips an integer offset and rejects anything else", () => {
    expect(decodeCursor(null)).toBe(0);
    expect(decodeCursor("")).toBe(0);
    expect(decodeCursor(encodeCursor(50))).toBe(50);
    expect(decodeCursor(encodeCursor(0))).toBe(0);
    expect(decodeCursor("not base64!")).toBeNull();
    expect(decodeCursor(btoa("abc"))).toBeNull();
    expect(decodeCursor(btoa("-5"))).toBeNull();
    expect(decodeCursor(btoa("1234567"))).toBeNull();
  });

  it("pages a capped list and emits nextCursor only when more rows remain", () => {
    const rows = Array.from({ length: 7 }, (_, i) => i);
    expect(page(rows, 0, 3)).toEqual({ items: [0, 1, 2], nextCursor: encodeCursor(3) });
    expect(page(rows, 3, 3)).toEqual({ items: [3, 4, 5], nextCursor: encodeCursor(6) });
    expect(page(rows, 6, 3)).toEqual({ items: [6], nextCursor: undefined });
    expect(page(rows, 50, 3)).toEqual({ items: [], nextCursor: undefined });
  });
});

describe("parseDatasetParams", () => {
  it("applies defaults", () => {
    expect(params("")).toEqual({ params: { window: undefined, category: undefined, platform: undefined, limit: 50, offset: 0, format: "json" } });
  });

  it("accepts valid values", () => {
    expect(params(`window=24h&category=ai&platform=mobile&limit=5&cursor=${encodeCursor(10)}&format=csv`)).toEqual({ params: { window: "24h", category: "ai", platform: "mobile", limit: 5, offset: 10, format: "csv" } });
  });

  it("rejects invalid values with a message that lists the accepted ones", () => {
    expect(params("window=1y")).toEqual({ error: "window must be one of 24h, 7d, 30d" });
    expect(params("platform=desktop")).toEqual({ error: "platform must be one of web, mobile, hybrid" });
    expect(params("format=xml")).toEqual({ error: "format must be one of json, csv" });
    expect(params("category=nope")).toEqual({ error: "category must be one of ai, developer-tools" });
    expect(params("limit=0")).toEqual({ error: "limit must be an integer between 1 and 100" });
    expect(params("limit=101")).toEqual({ error: "limit must be an integer between 1 and 100" });
    expect(params("limit=abc")).toEqual({ error: "limit must be an integer between 1 and 100" });
    expect(params("cursor=%%%")).toMatchObject({ error: expect.stringMatching(/cursor is invalid/) });
  });
});

describe("datasets", () => {
  it("maps every dataset to a board, a default window and a methodology anchor", () => {
    expect(DATASETS.trending).toMatchObject({ board: "trending", window: "7d" });
    expect(DATASETS["hidden-gems"]).toMatchObject({ board: "hidden-gems", window: "7d" });
    expect(DATASETS.movers.board).toBe("movers");
    expect(methodologyUrl("https://ut.dev", "hidden-gems")).toBe("https://ut.dev/hidden-gems#methodology");
    expect(methodologyUrl("https://ut.dev", "trending")).toBe("https://ut.dev/trending#how");
  });
});
