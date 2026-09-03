import { renderFounderCard } from "@/lib/og/share-card";
import { parseCardConfig } from "@/lib/share-card";
import { limit, tooMany } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

// Founder card PNG: /u/<username>/card?style=…&size=square&range=…
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const rl = await limit(req, "card");
  if (!rl.allowed) return tooMany(rl, "Too many card renders, retry shortly");
  const { username } = await params;
  return renderFounderCard(username.toLowerCase(), parseCardConfig(new URL(req.url).searchParams));
}
