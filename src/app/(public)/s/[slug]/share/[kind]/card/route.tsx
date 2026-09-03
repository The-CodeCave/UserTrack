import { renderShareCard } from "@/lib/og/share-card";
import { parseCardConfig } from "@/lib/share-card";
import { take } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";
const PER_MINUTE = 40;

// Deterministic: /s/<slug>/share/<kind>/card?style=…&size=square&range=…&chart=0&title=… (see src/lib/share-card.ts).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = take(`card:${ip}`, Date.now(), PER_MINUTE);
  if (!rl.allowed) return new Response("Too many card renders, retry shortly", { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": "no-store" } });
  const { slug, kind } = await params;
  return renderShareCard(slug, kind, parseCardConfig(new URL(req.url).searchParams));
}
