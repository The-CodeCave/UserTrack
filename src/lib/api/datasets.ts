// Public datasets: named projections over the public leaderboard boards, as JSON or CSV. Pure (no I/O, no aliased imports)
// so the Convex gateway and the Next.js routes share one definition of every dataset.

export const DATASET_WINDOWS = ["24h", "7d", "30d"] as const;
export type DatasetWindow = (typeof DATASET_WINDOWS)[number];
export const DATASET_PLATFORMS = ["web", "mobile", "hybrid"] as const;
export const DATASET_FORMATS = ["json", "csv"] as const;
export const DATASET_MAX_LIMIT = 100;
export const DATASET_DEFAULT_LIMIT = 50;

// name → board, default window, methodology anchor (relative to the site URL).
export const DATASETS = {
  trending: { board: "trending", window: "7d", methodology: "/trending#how", title: "Trending" },
  "fastest-growing": { board: "fastest", window: "30d", methodology: "/fastest-growing-saas#methodology", title: "Fastest growing" },
  "new-and-rising": { board: "new-rising", window: "7d", methodology: "/new-saas#methodology", title: "New & rising" },
  "hidden-gems": { board: "hidden-gems", window: "7d", methodology: "/hidden-gems#methodology", title: "Hidden gems" },
  movers: { board: "movers", window: "30d", methodology: "/biggest-movers#methodology", title: "Biggest movers" },
  category: { board: "most-new", window: "30d", methodology: "/leaderboard#methodology", title: "Category" },
} as const;
export type DatasetName = keyof typeof DATASETS;
export const DATASET_NAMES = Object.keys(DATASETS) as DatasetName[];

// One CSV / JSON row. Only public projections: every value comes from the public SaaS object.
export interface DatasetRow {
  position: number;
  slug: string;
  name: string;
  category?: string;
  projectType?: string;
  totalUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  newUsers30d: number;
  growth7dPct?: number;
  growth30dPct?: number;
  activationRatePct?: number;
  trendingRank?: number;
  trendingScore7d?: number;
  rank?: number;
  rank7dAgo?: number;
  rankDelta7d?: number;
  trust: string;
  verified: boolean;
  lastSyncedAt?: string;
  url: string;
}

export const CSV_COLUMNS: (keyof DatasetRow)[] = ["position", "slug", "name", "category", "projectType", "totalUsers", "newUsers24h", "newUsers7d", "newUsers30d", "growth7dPct", "growth30dPct", "activationRatePct", "trendingRank", "trendingScore7d", "rank", "rank7dAgo", "rankDelta7d", "trust", "verified", "lastSyncedAt", "url"];

// RFC 4180: quote when the value contains a comma, a quote or a line break; double embedded quotes.
export function csvEscape(v: unknown) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends object>(rows: T[], columns: (keyof T & string)[]) {
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","))];
  return lines.join("\r\n") + "\r\n";
}

export const csvFilename = (dataset: string, now = new Date()) => `usertrack-${dataset}-${now.toISOString().slice(0, 10)}.csv`;

// Opaque cursor = base64 of the integer offset. Anything else is rejected.
export const encodeCursor = (offset: number) => btoa(String(offset));
export function decodeCursor(cursor: string | null): number | null {
  if (cursor === null || cursor === "") return 0;
  let text: string;
  try {
    text = atob(cursor);
  } catch {
    return null;
  }
  return /^\d{1,6}$/.test(text) ? Number(text) : null;
}

export interface DatasetParams { window?: DatasetWindow; category?: string; platform?: (typeof DATASET_PLATFORMS)[number]; limit: number; offset: number; format: (typeof DATASET_FORMATS)[number] }

// Validates the common query params. Returns { error } with the offending message instead of throwing.
export function parseDatasetParams(q: URLSearchParams, categories: ReadonlySet<string>): { params: DatasetParams } | { error: string } {
  const oneOf = <T extends string>(name: string, list: readonly T[]): T | undefined | { error: string } => {
    const v = q.get(name);
    if (v === null) return undefined;
    return (list as readonly string[]).includes(v) ? (v as T) : { error: `${name} must be one of ${list.join(", ")}` };
  };
  const bad = (x: unknown): x is { error: string } => typeof x === "object" && x !== null && "error" in x;
  const window = oneOf("window", DATASET_WINDOWS);
  if (bad(window)) return window;
  const platform = oneOf("platform", DATASET_PLATFORMS);
  if (bad(platform)) return platform;
  const format = oneOf("format", DATASET_FORMATS);
  if (bad(format)) return format;
  const category = q.get("category") ?? undefined;
  if (category !== undefined && !categories.has(category)) return { error: `category must be one of ${[...categories].join(", ")}` };
  const limit = q.get("limit") === null ? DATASET_DEFAULT_LIMIT : Number(q.get("limit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > DATASET_MAX_LIMIT) return { error: `limit must be an integer between 1 and ${DATASET_MAX_LIMIT}` };
  const offset = decodeCursor(q.get("cursor"));
  if (offset === null) return { error: "cursor is invalid; pass the meta.nextCursor of the previous page" };
  return { params: { window, category, platform, limit, offset, format: format ?? "json" } };
}

// Datasets are served from one capped board read (DATASET_MAX_LIMIT rows), so a page is a slice of that window.
export function page<T>(rows: T[], offset: number, limit: number) {
  const items = rows.slice(offset, offset + limit);
  const nextCursor = offset + limit < rows.length ? encodeCursor(offset + limit) : undefined;
  return { items, nextCursor };
}

// Flattens a public SaaS projection (the API's SaasRow shape) into one dataset row.
export function datasetRow(r: { slug: string; name: string; category?: string; projectType?: string; totalUsers: number; newUsers24h: number; newUsers7d: number; newUsers30d: number; growth7dPct?: number; growth30dPct?: number; activationRatePct?: number; trendingRank?: number; trendingScore7d?: number; rank?: number; rank7dAgo?: number; rankDelta7d?: number; trust: string; lastSyncedAt?: number }, position: number, siteUrl: string): DatasetRow {
  return {
    position,
    slug: r.slug,
    name: r.name,
    category: r.category,
    projectType: r.projectType ?? "web",
    totalUsers: r.totalUsers,
    newUsers24h: r.newUsers24h,
    newUsers7d: r.newUsers7d,
    newUsers30d: r.newUsers30d,
    growth7dPct: r.growth7dPct,
    growth30dPct: r.growth30dPct,
    activationRatePct: r.activationRatePct,
    trendingRank: r.trendingRank,
    trendingScore7d: r.trendingScore7d,
    rank: r.rank,
    rank7dAgo: r.rank7dAgo,
    rankDelta7d: r.rankDelta7d,
    trust: r.trust,
    verified: r.trust === "verified",
    lastSyncedAt: r.lastSyncedAt === undefined ? undefined : new Date(r.lastSyncedAt).toISOString(),
    url: `${siteUrl}/s/${r.slug}`,
  };
}

export const methodologyUrl = (siteUrl: string, dataset: DatasetName) => `${siteUrl}${DATASETS[dataset].methodology}`;
