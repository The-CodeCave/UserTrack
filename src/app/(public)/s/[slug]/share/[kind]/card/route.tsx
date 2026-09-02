import { renderShareCard } from "@/lib/og/share-card";
import { parseShareSize } from "@/lib/share";

export const dynamic = "force-dynamic";

// Deterministic: /s/<slug>/share/<kind>/card[?size=square]
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  return renderShareCard(slug, kind, parseShareSize(new URL(req.url).searchParams.get("size")));
}
