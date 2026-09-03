import { coreFromOptions, handleMetrics, type HandlerOptions, toResponse } from "./handler.js";
import type { ConversionMode } from "@usertrack/protocol";
import type { CountResult, CountSource } from "./sources.js";

/** Args the referenced Convex query receives; epoch milliseconds. */
export type ConvexCountArgs = { createdAtGte?: number; createdAtLt?: number };
type RunQuery = (ref: unknown, args: ConvexCountArgs) => Promise<CountResult>;
type ConvexCtx = { runQuery: (ref: never, args: never) => Promise<unknown> };

export type ConvexHandlerOptions = Omit<HandlerOptions, "users" | "activation" | "conversion" | "source"> & {
  /** `internal.usertrack.countUsers` — a query taking ConvexCountArgs and returning a number or { count, exact }. */
  users: unknown;
  activation?: unknown;
  conversion?: { converted: unknown; trial?: unknown; mode?: ConversionMode };
};

const source = (run: RunQuery, ref: unknown): CountSource => ({
  count: (where) => run(ref, { ...(where.createdAtGte ? { createdAtGte: where.createdAtGte.getTime() } : {}), ...(where.createdAtLt ? { createdAtLt: where.createdAtLt.getTime() } : {}) }),
});

/**
 * Wrap in `httpAction` in `convex/http.ts`:
 * `http.route({ path: "/usertrack/metrics", method: "POST", handler: httpAction(convexHandler({ projectId, secret, users: internal.usertrack.countUsers })) })`
 */
export function convexHandler(options: ConvexHandlerOptions) {
  const { users, activation, conversion, ...rest } = options;
  let core: ReturnType<typeof coreFromOptions> | null = null;
  return async (ctx: ConvexCtx, req: Request): Promise<Response> => {
    const run = ctx.runQuery as unknown as RunQuery;
    const sources: Pick<HandlerOptions, "users" | "activation" | "conversion"> = {
      users: source(run, users),
      ...(activation ? { activation: source(run, activation) } : {}),
      ...(conversion ? { conversion: { converted: source(run, conversion.converted), ...(conversion.trial ? { trial: source(run, conversion.trial) } : {}), ...(conversion.mode ? { mode: conversion.mode } : {}) } } : {}),
    };
    core ??= coreFromOptions({ ...rest, ...sources, source: "convex" });
    core.sources = { ...core.sources, ...sources };
    if (req.method !== "POST") return new Response(JSON.stringify({ code: "USERTRACK_BAD_REQUEST", message: "POST signed metrics requests here" }), { status: 405, headers: { "content-type": "application/json", allow: "POST" } });
    return toResponse(await handleMetrics(core, { headers: req.headers, body: await req.text() }));
  };
}

/**
 * Convex has no cheap count: reads up to `cap + 1` documents and reports `exact: false` beyond the cap
 * (UserTrack then labels the numbers as approximate). Use `@convex-dev/aggregate` for exact counts at scale.
 */
export async function countWithCap(query: { take(n: number): Promise<unknown[]> }, cap = 10_000): Promise<{ count: number; exact: boolean }> {
  const rows = await query.take(cap + 1);
  return { count: Math.min(rows.length, cap), exact: rows.length <= cap };
}
