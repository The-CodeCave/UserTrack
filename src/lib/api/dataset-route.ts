// Next.js side of the datasets: one capped public board read, sliced by cursor, as JSON or CSV.
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { csv, fail, ok } from "@/lib/api/respond";
import { CATEGORY_SLUGS } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";
import { CSV_COLUMNS, DATASETS, DATASET_MAX_LIMIT, csvFilename, datasetRow, methodologyUrl, page, parseDatasetParams, toCsv, type DatasetName } from "./datasets";

export const DATASET_BOARDS = ["trending", "fastest", "most-users", "most-new", "most-activated", "activation-rate", "new-rising", "hidden-gems", "movers", "best-conversion", "best-trial-conversion", "converted-growth"] as const;

export async function datasetResponse(req: Request, dataset: DatasetName, fixed: { category?: string; board?: (typeof DATASET_BOARDS)[number] } = {}) {
  const parsed = parseDatasetParams(new URL(req.url).searchParams, CATEGORY_SLUGS);
  if ("error" in parsed) return fail("bad_request", parsed.error, 400);
  const { window, platform, limit, offset, format } = parsed.params;
  const category = fixed.category ?? parsed.params.category;
  const def = DATASETS[dataset];
  const board = fixed.board ?? def.board;
  const w = window ?? def.window;
  const [rows, meta] = await Promise.all([
    fetchQuery(api.public.board, { board, window: w, verifiedOnly: true, category, platform, limit: DATASET_MAX_LIMIT }),
    fetchQuery(api.public.boardMeta, { category }),
  ]);
  const all = rows.map((r, i) => datasetRow(r, i + 1, SITE_URL));
  const { items, nextCursor } = page(all, offset, limit);
  const name = dataset === "category" ? `category-${category}` : dataset;
  const extra = { dataset: name, board, window: w, category, platform, count: items.length, total: all.length, nextCursor, updatedAt: meta.updatedAt ? new Date(meta.updatedAt).toISOString() : null, methodology: methodologyUrl(SITE_URL, dataset), maxRows: DATASET_MAX_LIMIT };
  if (format === "csv") return csv(toCsv(items, CSV_COLUMNS), csvFilename(name), nextCursor ? { "X-Next-Cursor": nextCursor } : {});
  return ok(items, extra);
}
