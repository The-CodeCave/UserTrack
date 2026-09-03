import type { MetadataRoute } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { SITE_URL } from "@/lib/site";
import { rankingPath } from "@/lib/boards";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await fetchQuery(api.public.sitemap, {});
  const now = new Date();
  const fixed = ["", "/leaderboard", "/trending", "/discover", "/fastest-growing-saas", "/fastest-growing-ai-saas", "/new-saas", "/most-new-users", "/best-conversion", "/hidden-gems", "/biggest-movers", "/fastest-growing-developer-tools", "/fastest-growing-mobile-apps", "/best-activation-rate-saas", "/best-converting-mobile-apps", "/rankings", "/categories", "/compare", "/developers", "/developers/webhooks"];
  return [
    ...fixed.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "hourly" as const, priority: p === "" ? 1 : 0.8 })),
    ...data.categories.map((c) => ({ url: `${SITE_URL}/categories/${c}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...data.saas.map((s) => ({ url: `${SITE_URL}/s/${s.slug}`, lastModified: new Date(s.updatedAt), changeFrequency: "daily" as const, priority: 0.6 })),
    ...data.profiles.map((p) => ({ url: `${SITE_URL}/u/${p.username}`, lastModified: new Date(p.updatedAt), changeFrequency: "weekly" as const, priority: 0.4 })),
    // Frozen monthly rankings: one URL per period + category; the board is a query switch on that page.
    ...data.rankings.filter((r) => r.board === "most-new").map((r) => ({ url: `${SITE_URL}${rankingPath(r.period, r.category)}`, lastModified: new Date(r.computedAt), changeFrequency: "yearly" as const, priority: 0.5 })),
  ];
}
