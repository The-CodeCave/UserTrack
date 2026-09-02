// Convenience alias for /api/v1/leaderboard?board=trending (same filters, same envelope).
import { GET as leaderboard } from "../leaderboard/route";
import { options } from "@/lib/api/respond";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

export async function GET(req: Request, ctx: unknown) {
  const url = new URL(req.url);
  url.searchParams.set("board", "trending");
  return leaderboard(new Request(url, { headers: req.headers }), ctx);
}
