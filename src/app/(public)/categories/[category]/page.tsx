import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { CATEGORIES } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const c = CATEGORIES.find((x) => x.slug === category);
  if (!c) return { title: "Not found" };
  return {
    title: `Top ${c.label} SaaS by user growth`,
    description: `${c.label} SaaS products ranked by verified user growth. Live user counts, trends and milestones for the fastest growing ${c.seo}.`,
    alternates: { canonical: `${SITE_URL}/categories/${c.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<SP> }) {
  const { category } = await params;
  const c = CATEGORIES.find((x) => x.slug === category);
  if (!c) notFound();
  const state = parseBoard(await searchParams, { board: "most-new", category: c.slug });
  return (
    <BoardPage
      state={{ ...state, category: c.slug }}
      base={`/categories/${c.slug}`}
      lockCategory
      eyebrow={`${c.label} · ${state.window}`}
      title={`Top ${c.label} SaaS by user growth`}
      intro={`${c.label} products on UserTrack, ranked by verified user growth. Switch boards to see trending, fastest growing or largest ${c.seo}.`}
      related={[{ href: "/categories", label: "All categories" }, ...(c.slug === "ai" ? [{ href: "/fastest-growing-ai-saas", label: "Fastest growing AI" }] : [])]}
    />
  );
}
