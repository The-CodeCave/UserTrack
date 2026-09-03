import { OG_SIZE } from "@/lib/og/frame";
import { renderFounderCard } from "@/lib/og/share-card";
import { DEFAULT_CARD } from "@/lib/share-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Founder profile on UserTrack";
export const revalidate = 300;

// Same renderer as the downloadable founder card, so the social preview and the asset a founder posts are identical.
export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return renderFounderCard(username.toLowerCase(), { ...DEFAULT_CARD, range: "90d" });
}
