import { renderShareCard } from "@/lib/og/share-card";
import { parseCardConfig } from "@/lib/share-card";
import { limit, tooMany } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

// Deterministic: /s/<slug>/share/<kind>/card?style=…&size=square&range=…&chart=0&title=… (see src/lib/share-card.ts).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const rl = await limit(req, "card");
  if (!rl.allowed) return tooMany(rl, "Too many card renders, retry shortly");
  const { slug, kind } = await params;
  return renderShareCard(slug, kind, parseCardConfig(new URL(req.url).searchParams));
}
