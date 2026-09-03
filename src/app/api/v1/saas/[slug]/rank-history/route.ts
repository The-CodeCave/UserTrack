import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { rankHistoryDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

const KINDS = ["leaderboard", "trending"] as const;
const WINDOWS = ["24h", "7d", "30d"] as const;
const oneOf = <T extends string>(v: string | null, list: readonly T[]): T | undefined | null => (v === null ? undefined : (list as readonly string[]).includes(v) ? (v as T) : null);
const bad = (name: string, list: readonly string[]) => fail("bad_request", `${name} must be one of ${list.join(", ")}`, 400);

// Stored daily ranking positions (append-only), oldest first, with the current / best / 7-days-ago position.
export const GET = withApi("rank-history", async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const q = new URL(req.url).searchParams;
  const kind = oneOf(q.get("kind"), KINDS);
  if (kind === null) return bad("kind", KINDS);
  const window = oneOf(q.get("window"), WINDOWS);
  if (window === null) return bad("window", WINDOWS);
  const days = q.get("days") === null ? 90 : Number(q.get("days"));
  if (!Number.isInteger(days) || days < 7 || days > 730) return fail("bad_request", "days must be an integer between 7 and 730", 400);
  const r = await fetchQuery(api.public.rankHistory, { slug, kind, window, days });
  if (!r) return fail("not_found", `No public SaaS with slug "${slug}"`, 404);
  return ok(rankHistoryDto(r));
});
