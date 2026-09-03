import { fail, options, withApi } from "@/lib/api/respond";
import { DATASET_NAMES, type DatasetName } from "@/lib/api/datasets";
import { datasetResponse } from "@/lib/api/dataset-route";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

const NAMED = DATASET_NAMES.filter((d) => d !== "category");

// GET /datasets/{trending|fastest-growing|new-and-rising|hidden-gems|movers}?window=&category=&platform=&limit=&cursor=&format=
export const GET = withApi("datasets", async (req: Request, { params }: { params: Promise<{ dataset: string }> }) => {
  const { dataset } = await params;
  if (!(NAMED as string[]).includes(dataset)) return fail("not_found", `Unknown dataset "${dataset}". Datasets: ${NAMED.join(", ")}, categories/{slug}, rankings/history`, 404);
  return datasetResponse(req, dataset as DatasetName);
});
