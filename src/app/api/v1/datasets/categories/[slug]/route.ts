import { fail, options, withApi } from "@/lib/api/respond";
import { CATEGORY_SLUGS } from "@/lib/categories";
import { DATASET_BOARDS, datasetResponse } from "@/lib/api/dataset-route";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// GET /datasets/categories/{slug}?board=most-new — one category as a dataset; any leaderboard board is allowed.
export const GET = withApi("datasets", async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  if (!CATEGORY_SLUGS.has(slug)) return fail("not_found", `Unknown category "${slug}". Categories: ${[...CATEGORY_SLUGS].join(", ")}`, 404);
  const board = new URL(req.url).searchParams.get("board") ?? "most-new";
  if (!(DATASET_BOARDS as readonly string[]).includes(board)) return fail("bad_request", `board must be one of ${DATASET_BOARDS.join(", ")}`, 400);
  return datasetResponse(req, "category", { category: slug, board: board as (typeof DATASET_BOARDS)[number] });
});
