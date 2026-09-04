// Liveness for Railway (railway.toml → healthcheckPath). The plain check never touches Convex so a database blip
// cannot restart a healthy app; `?deep=1` adds one cheap Convex read and still answers 200 with `convex: "down"`.
import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { APP_VERSION } from "@/lib/site";

export const dynamic = "force-dynamic";

const DEEP_TIMEOUT_MS = 3_000;

const timeout = <T>(promise: Promise<T>) => {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), DEEP_TIMEOUT_MS); })])
    .catch(() => null)
    .finally(() => clearTimeout(timer));
};

export async function GET(request: Request) {
  const body: Record<string, unknown> = { ok: true, version: APP_VERSION, uptime: Math.round(process.uptime()) };
  if (new URL(request.url).searchParams.get("deep") === "1") {
    // Two independent probes: a missing gateway secret must not make a healthy Convex look down.
    const gateway = process.env.UT_GATEWAY_SECRET;
    const [stats, jobs] = await Promise.all([
      timeout(fetchQuery(api.public.stats, {})),
      gateway ? timeout(fetchQuery(api.jobs.health, { gateway })) : Promise.resolve(null),
    ]);
    body.convex = stats ? "ok" : "down";
    body.jobs = !gateway ? "unavailable: gateway secret not configured" : (jobs ?? "unavailable: jobs.health did not answer");
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
