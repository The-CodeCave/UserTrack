export const CATEGORIES = [
  { slug: "ai", label: "AI", seo: "AI SaaS" },
  { slug: "developer-tools", label: "Developer Tools", seo: "developer tools" },
  { slug: "analytics", label: "Analytics", seo: "analytics SaaS" },
  { slug: "marketing", label: "Marketing", seo: "marketing SaaS" },
  { slug: "sales", label: "Sales & CRM", seo: "sales and CRM SaaS" },
  { slug: "productivity", label: "Productivity", seo: "productivity SaaS" },
  { slug: "fintech", label: "Fintech", seo: "fintech SaaS" },
  { slug: "no-code", label: "No-code", seo: "no-code tools" },
  { slug: "design", label: "Design", seo: "design SaaS" },
  { slug: "ecommerce", label: "E-commerce", seo: "e-commerce SaaS" },
  { slug: "education", label: "Education", seo: "edtech SaaS" },
  { slug: "health", label: "Health", seo: "health SaaS" },
  { slug: "social", label: "Social & Community", seo: "community SaaS" },
  { slug: "infrastructure", label: "Infrastructure", seo: "infrastructure SaaS" },
  { slug: "other", label: "Other", seo: "SaaS" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export const CATEGORY_SLUGS = new Set<string>(CATEGORIES.map((c) => c.slug));
export const categoryLabel = (slug?: string | null) => CATEGORIES.find((c) => c.slug === slug)?.label ?? (slug ?? "Uncategorized");
