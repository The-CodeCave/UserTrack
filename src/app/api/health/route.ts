// Liveness for Railway (railway.toml → healthcheckPath). The plain check never touches Convex so a database blip
// cannot restart a healthy app; `?deep=1` adds one cheap Convex read and still answers 200 with `convex: "down"`.
import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { APP_VERSION } from "@/lib/site";

export const dynamic = "force-dynamic";

const DEEP_TIMEOUT_MS = 3_000;

const timeout = <T>(promise: Promise<T>) =>
  Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), DEEP_TIMEOUT_MS))]).catch(() => null);

export async function GET(request: Request) {
  const body: Record<string, unknown> = { ok: true, version: APP_VERSION, uptime: Math.round(process.uptime()) };
  if (new URL(request.url).searchParams.get("deep") === "1") {
    const result = await timeout(Promise.all([
      fetchQuery(api.public.stats, {}),
      fetchQuery(api.jobs.health, { gateway: process.env.UT_GATEWAY_SECRET }),
    ]));
    body.convex = result ? "ok" : "down";
    if (result) body.jobs = result[1];
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
