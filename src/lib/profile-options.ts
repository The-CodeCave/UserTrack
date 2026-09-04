// Curated option lists + length limits for the product profile (form, domain validation, MCP schema, public page).
// Markets align with src/lib/categories.ts slugs where they overlap. Nothing here is a revenue field — by design.
export const MARKETS = [
  { slug: "marketing", label: "Marketing" }, { slug: "developer-tools", label: "Developer tools" }, { slug: "ai", label: "AI" }, { slug: "analytics", label: "Analytics" },
  { slug: "ecommerce", label: "E-commerce" }, { slug: "fintech", label: "Fintech" }, { slug: "productivity", label: "Productivity" }, { slug: "education", label: "Education" },
  { slug: "health", label: "Health" }, { slug: "hr", label: "HR" }, { slug: "sales", label: "Sales" }, { slug: "design", label: "Design" }, { slug: "social", label: "Social" },
  { slug: "gaming", label: "Gaming" }, { slug: "security", label: "Security" }, { slug: "infrastructure", label: "Infrastructure" }, { slug: "media", label: "Media" },
  { slug: "real-estate", label: "Real estate" }, { slug: "travel", label: "Travel" }, { slug: "other", label: "Other" },
] as const;

export const MARKETING_CHANNELS = [
  { slug: "seo", label: "SEO" }, { slug: "content", label: "Content" }, { slug: "x", label: "X" }, { slug: "linkedin", label: "LinkedIn" }, { slug: "product-hunt", label: "Product Hunt" },
  { slug: "reddit", label: "Reddit" }, { slug: "youtube", label: "YouTube" }, { slug: "tiktok", label: "TikTok" }, { slug: "newsletter", label: "Newsletter" }, { slug: "cold-email", label: "Cold email" },
  { slug: "paid-ads", label: "Paid ads" }, { slug: "affiliates", label: "Affiliates" }, { slug: "communities", label: "Communities" }, { slug: "partnerships", label: "Partnerships" },
  { slug: "word-of-mouth", label: "Word of mouth" }, { slug: "directories", label: "Directories" }, { slug: "podcasts", label: "Podcasts" }, { slug: "events", label: "Events" },
  { slug: "app-store", label: "App Store" }, { slug: "other", label: "Other" },
] as const;

export const FUNDING = [{ key: "bootstrapped", label: "Bootstrapped" }, { key: "vc", label: "VC-backed" }] as const;
export const TEAM_SIZES = ["1", "2-5", "6-10", "11-50", "50+"] as const;
export type Funding = (typeof FUNDING)[number]["key"];
export type TeamSize = (typeof TEAM_SIZES)[number];

export const PROFILE_LIMITS = { name: 100, description: 500, valueProposition: 300, problemSolved: 300, audience: 200, pricingSummary: 300, additionalInfo: 500, markets: 5, marketingChannels: 15, cofounders: 5, cofounderName: 60 } as const;

export const MARKET_SLUGS = new Set<string>(MARKETS.map((m) => m.slug));
export const CHANNEL_SLUGS = new Set<string>(MARKETING_CHANNELS.map((c) => c.slug));
export const marketLabel = (slug: string) => MARKETS.find((m) => m.slug === slug)?.label ?? slug;
export const channelLabel = (slug: string) => MARKETING_CHANNELS.find((c) => c.slug === slug)?.label ?? slug;
export const fundingLabel = (key?: string) => FUNDING.find((f) => f.key === key)?.label;
export const teamSizeLabel = (key?: string) => (key ? `${key} ${key === "1" ? "person" : "people"}` : undefined);
