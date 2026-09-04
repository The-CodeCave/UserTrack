import type { MetadataRoute } from "next";
import { publicData, publicQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { SITE_URL } from "@/lib/site";
import { rankingPath } from "@/lib/boards";
import { EFFECTIVE_DATE, LEGAL_PAGES } from "@/lib/legal";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const raw = await publicData(() => publicQuery(api.public.sitemap, {}));
  const data = { categories: raw?.categories ?? [], stacks: raw?.stacks ?? [], saas: raw?.saas ?? [], profiles: raw?.profiles ?? [], rankings: raw?.rankings ?? [] };
  const now = new Date();
  const fixed = ["", "/leaderboard", "/trending", "/discover", "/fastest-growing-saas", "/fastest-growing-ai-saas", "/new-saas", "/most-new-users", "/best-conversion", "/hidden-gems", "/biggest-movers", "/fastest-growing-developer-tools", "/fastest-growing-mobile-apps", "/best-activation-rate-saas", "/best-converting-mobile-apps", "/rankings", "/categories", "/compare", "/developers", "/developers/webhooks"];
  return [
    ...fixed.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "hourly" as const, priority: p === "" ? 1 : 0.8 })),
    ...LEGAL_PAGES.map((p) => ({ url: `${SITE_URL}${p.href}`, lastModified: new Date(EFFECTIVE_DATE), changeFrequency: "yearly" as const, priority: 0.3 })),
    ...data.categories.map((c) => ({ url: `${SITE_URL}/categories/${c}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...data.stacks.map((t) => ({ url: `${SITE_URL}/stacks/${t}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.6 })),
    ...data.saas.map((s) => ({ url: `${SITE_URL}/s/${s.slug}`, lastModified: new Date(s.updatedAt), changeFrequency: "daily" as const, priority: 0.6 })),
    ...data.profiles.map((p) => ({ url: `${SITE_URL}/u/${p.username}`, lastModified: new Date(p.updatedAt), changeFrequency: "weekly" as const, priority: 0.4 })),
    // Frozen monthly rankings: one URL per period + category; the board is a query switch on that page.
    ...data.rankings.filter((r) => r.board === "most-new").map((r) => ({ url: `${SITE_URL}${rankingPath(r.period, r.category)}`, lastModified: new Date(r.computedAt), changeFrequency: "yearly" as const, priority: 0.5 })),
  ];
}
