import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { csv, fail, ok, options, withApi } from "@/lib/api/respond";
import { CATEGORY_SLUGS } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";
import { csvFilename, toCsv } from "@/lib/api/datasets";
import { DATASET_BOARDS } from "@/lib/api/dataset-route";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// GET /datasets/rankings/history?period=YYYY-MM&board=&category=&format= — frozen monthly rankings; without period, the index.
export const GET = withApi("datasets", async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const period = q.get("period");
  const board = q.get("board") ?? "most-new";
  if (!(DATASET_BOARDS as readonly string[]).includes(board)) return fail("bad_request", `board must be one of ${DATASET_BOARDS.join(", ")}`, 400);
  const category = q.get("category") ?? undefined;
  if (category !== undefined && !CATEGORY_SLUGS.has(category)) return fail("bad_request", `category must be one of ${[...CATEGORY_SLUGS].join(", ")}`, 400);
  const format = q.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return fail("bad_request", "format must be one of json, csv", 400);
  if (period === null) {
    if (format === "csv") return fail("bad_request", "Pass period=YYYY-MM to download a ranking as CSV", 400);
    const periods = await fetchQuery(api.public.rankingPeriods, {});
    return ok(periods.map((p) => ({ period: p.period, board: p.board, category: p.category, sampleSize: p.sampleSize, computedAt: new Date(p.computedAt).toISOString(), url: `${SITE_URL}/api/v1/datasets/rankings/history?period=${p.period}&board=${p.board}${p.category ? `&category=${p.category}` : ""}` })), { dataset: "rankings", methodology: `${SITE_URL}/rankings#methodology` });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) return fail("bad_request", "period must look like YYYY-MM", 400);
  const snap = await fetchQuery(api.public.rankingSnapshot, { period, board, category });
  if (!snap) return fail("not_found", `No frozen ranking for ${period} / ${board}${category ? ` / ${category}` : ""}`, 404);
  const rows = snap.rows.map((r) => ({ rank: r.rank, slug: r.slug, name: r.name, category: r.category, value: r.value, totalUsers: r.totalUsers, newUsers30d: r.newUsers30d, growth30dPct: r.growth30dPct, trust: r.trust, verified: r.trust === "verified", logoUrl: r.logoUrl, url: `${SITE_URL}/s/${r.slug}` }));
  const extra = { dataset: "rankings", period, board, category: category ?? null, sampleSize: snap.sampleSize, computedAt: new Date(snap.computedAt).toISOString(), methodology: `${SITE_URL}/rankings#methodology`, page: `${SITE_URL}/rankings/${period.replace("-", "/")}${category ? `/${category}` : ""}` };
  if (format === "csv") return csv(toCsv(rows, ["rank", "slug", "name", "category", "value", "totalUsers", "newUsers30d", "growth30dPct", "trust", "verified", "url"]), csvFilename(`rankings-${period}-${board}${category ? `-${category}` : ""}`));
  return ok(rows, extra);
});
