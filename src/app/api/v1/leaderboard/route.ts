import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { saasDto } from "@/lib/api/dto";
import { CATEGORY_SLUGS } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

const BOARDS = ["trending", "fastest", "most-users", "most-new", "most-activated", "activation-rate", "new-rising", "best-conversion", "best-trial-conversion", "converted-growth"] as const;
const WINDOWS = ["24h", "7d", "30d"] as const;
const SIZES = ["0-100", "100-1k", "1k-10k", "10k-100k", "100k+"] as const;
const BOOLS = ["true", "false"] as const;

const oneOf = <T extends string>(v: string | null, list: readonly T[]): T | undefined | null => (v === null ? undefined : (list as readonly string[]).includes(v) ? (v as T) : null);
const bad = (name: string, list: readonly string[]) => fail("bad_request", `${name} must be one of ${list.join(", ")}`, 400);

export const GET = withApi("leaderboard", async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const board = oneOf(q.get("board"), BOARDS);
  if (board === null) return bad("board", BOARDS);
  const window = oneOf(q.get("window"), WINDOWS);
  if (window === null) return bad("window", WINDOWS);
  const size = oneOf(q.get("size"), SIZES);
  if (size === null) return bad("size", SIZES);
  const verified = oneOf(q.get("verified"), BOOLS);
  if (verified === null) return bad("verified", BOOLS);
  const category = q.get("category") ?? undefined;
  if (category !== undefined && !CATEGORY_SLUGS.has(category)) return bad("category", [...CATEGORY_SLUGS]);
  const limit = q.get("limit") === null ? 50 : Number(q.get("limit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail("bad_request", "limit must be an integer between 1 and 100", 400);

  const b = board ?? "most-new";
  const w = window ?? (b === "trending" ? "7d" : "30d");
  const rows = await fetchQuery(api.public.board, { board: b, window: w, verifiedOnly: verified !== "false", category, size, limit });
  return ok({
    board: b,
    window: w,
    rows: rows.map((row, i) => ({ position: i + 1, movement: row.movement ?? null, ...(b === "trending" ? { explain: row.explain } : {}), ...saasDto(row) })),
  });
});
