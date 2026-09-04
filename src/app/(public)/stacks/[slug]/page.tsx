import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { TECH_STACK_BY_SLUG } from "@/lib/tech-stack";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

// "SaaS built with Next.js": one SEO page per curated technology; free-text stack entries only work as ?stack= on /discover.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = TECH_STACK_BY_SLUG.get(slug);
  if (!t) return { title: "Not found" };
  return {
    title: `SaaS built with ${t.label} — ranked by user growth`,
    description: `Products built with ${t.label}, ranked by verified user growth on UserTrack. Live user counts, trends and milestones.`,
    alternates: { canonical: `${SITE_URL}/stacks/${t.slug}` },
  };
}

export default async function StackPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const t = TECH_STACK_BY_SLUG.get(slug);
  if (!t) notFound();
  const state = parseBoard(await searchParams, { board: "most-new", stack: t.slug });
  return (
    <BoardPage
      state={{ ...state, stack: t.slug }}
      base={`/stacks/${t.slug}`}
      eyebrow={`Built with ${t.label} · ${state.window}`}
      title={`SaaS built with ${t.label}`}
      intro={`Products whose founders list ${t.label} in their stack, ranked by verified user growth. Filter by category, size or platform.`}
      related={[{ href: "/discover", label: "Discover" }, { href: "/categories", label: "All categories" }]}
    />
  );
}
