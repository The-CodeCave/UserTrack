import { renderFounderCard } from "@/lib/og/share-card";
import { parseCardConfig } from "@/lib/share-card";
import { take } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";
const PER_MINUTE = 40;

// Founder card PNG: /u/<username>/card?style=…&size=square&range=…
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = take(`card:${ip}`, Date.now(), PER_MINUTE);
  if (!rl.allowed) return new Response("Too many card renders, retry shortly", { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": "no-store" } });
  const { username } = await params;
  return renderFounderCard(username.toLowerCase(), parseCardConfig(new URL(req.url).searchParams));
}
