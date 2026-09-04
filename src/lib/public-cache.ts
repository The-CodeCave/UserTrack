// Caching policy for the anonymous, identical-for-everyone part of the site (docs/ARCHITECTURE.md → Public caching).
// Public data refreshes every 4 h (sync) / 20 min (rerank), so five minutes of staleness is invisible.
export const PUBLIC_REVALIDATE = 300;
export const PUBLIC_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=1800";

// Routes the header applies to. Never /app, the auth pages or /api/** — those set their own no-store / s-maxage.
export const CACHEABLE_PUBLIC = [
  "/", "/leaderboard", "/trending", "/discover", "/compare", "/categories", "/categories/:category",
  "/rankings", "/rankings/:year/:month/:category", "/s/:slug", "/s/:slug/share/:kind", "/u/:username",
  "/stacks/:slug", "/developers", "/developers/:path*", "/impressum", "/privacy", "/terms",
  "/fastest-growing-saas", "/fastest-growing-ai-saas", "/fastest-growing-developer-tools", "/fastest-growing-mobile-apps",
  "/new-saas", "/most-new-users", "/best-conversion", "/best-activation-rate-saas", "/best-converting-mobile-apps",
  "/hidden-gems", "/biggest-movers", "/sitemap.xml", "/robots.txt",
];

// True when a concrete path is covered by one of the patterns above (`:param` = one segment, `:p*` = the rest).
export function isCacheablePublicPath(path: string) {
  return CACHEABLE_PUBLIC.some((pattern) => {
    const re = new RegExp(`^${pattern.replace(/[.]/g, "\\.").replace(/:[a-zA-Z]+\*/g, ".*").replace(/:[a-zA-Z]+/g, "[^/]+")}$`);
    return re.test(path);
  });
}

// Stable cache key: object keys are sorted so two call sites building the same args in a different order share an entry.
export const stableArgs = (args: unknown): string =>
  JSON.stringify(args, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b))) : v));
