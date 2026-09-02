import { renderShareCard } from "@/lib/og/share-card";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  return renderShareCard(slug, kind);
}
