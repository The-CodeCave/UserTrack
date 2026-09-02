import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { ok, options, withApi } from "@/lib/api/respond";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

export const GET = withApi("categories", async () => {
  const stats = await fetchQuery(api.public.stats, {});
  return ok(stats.categories.map((c) => ({ slug: c.slug, label: c.label, count: c.count, url: `${SITE_URL}/categories/${c.slug}` })));
});
