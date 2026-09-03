import { describe, expect, it } from "vitest";
import { openapi } from "./openapi";

type Node = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;
const refs = (v: Node, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => refs(x as Node, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "$ref" && typeof x === "string") out.push(x); else refs(x as Node, out); }
  return out;
};

describe("openapi()", () => {
  const doc = openapi();
  const paths = doc.paths as Record<string, Record<string, { operationId: string; tags: string[]; parameters?: { name: string; in: string }[] }>>;

  it("is a 3.1 document with unique operationIds and only known tags", () => {
    expect(doc.openapi).toBe("3.1.0");
    const tags = new Set(doc.tags.map((t) => t.name));
    const ids = Object.values(paths).flatMap((p) => Object.values(p).map((op) => op.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    for (const op of Object.values(paths).flatMap((p) => Object.values(p))) for (const t of op.tags) expect(tags.has(t), t).toBe(true);
  });

  it("resolves every $ref and declares every path parameter", () => {
    const schemas = doc.components.schemas as Record<string, unknown>;
    for (const r of refs(doc as unknown as Node)) {
      const m = /^#\/components\/schemas\/(.+)$/.exec(r);
      expect(m, r).not.toBeNull();
      expect(schemas[m![1]], r).toBeDefined();
    }
    for (const [path, ops] of Object.entries(paths)) {
      for (const name of [...path.matchAll(/\{(\w+)\}/g)].map((x) => x[1])) for (const op of Object.values(ops)) expect(op.parameters?.some((p) => p.in === "path" && p.name === name), `${path} ${name}`).toBe(true);
    }
  });

  it("describes the v0.9 surface", () => {
    for (const p of ["/saas/{slug}/rank-history", "/saas/{slug}/benchmark-history", "/following", "/datasets/{dataset}", "/datasets/categories/{slug}", "/datasets/rankings/history"]) expect(paths[p]?.get, p).toBeDefined();
    expect(paths["/leaderboard"].get.parameters!.map((p) => p.name)).toContain("platform");
    const board = paths["/leaderboard"].get.parameters!.find((p) => p.name === "board") as unknown as { schema: { enum: string[] } };
    expect(board.schema.enum).toEqual(expect.arrayContaining(["hidden-gems", "movers"]));
    for (const s of ["RankHistory", "BenchmarkHistory", "Following", "Dataset", "DatasetCsv", "RankingSnapshot", "Movement"]) expect(doc.components.schemas, s).toHaveProperty(s);
    expect(doc.components.schemas.History.properties).toHaveProperty("resolution");
    expect(doc.components.schemas.History.properties).toHaveProperty("gaps");
  });
});
