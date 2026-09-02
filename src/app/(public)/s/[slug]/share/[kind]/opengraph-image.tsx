import { OG_SIZE } from "@/lib/og/frame";
import { renderShareCard } from "@/lib/og/share-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Share card";

export default async function Image({ params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  return renderShareCard(slug, kind);
}
