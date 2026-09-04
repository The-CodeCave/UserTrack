import { unstable_cache } from "next/cache";
import { ConvexHttpClient } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";
import { PUBLIC_REVALIDATE, stableArgs } from "./public-cache";

// `fetchQuery` from convex/nextjs pins every request to `cache: "no-store"`, which opts the whole route out of
// Next's route cache. Public pages carry no per-user data, so they read through a plain HTTP client and are
// cached by the route itself (ISR) — or, for URLs with search params, by `cachedQuery` below.
let client: ConvexHttpClient | undefined;

export function publicQuery<Q extends FunctionReference<"query", "public">>(query: Q, args: Q["_args"]): Promise<Q["_returnType"]> {
  client ??= new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  return client.query(query, args);
}

const readers = new Map<string, (argsJson: string) => Promise<unknown>>();

// Per-URL data cache for public pages that read search params: those still render per request (Next has no
// per-search-params route cache without Cache Components), but the Convex read behind them is cached.
export function cachedQuery<Q extends FunctionReference<"query", "public">>(query: Q, args: Q["_args"]): Promise<Q["_returnType"]> {
  const name = getFunctionName(query);
  let read = readers.get(name);
  if (!read) {
    read = unstable_cache((argsJson: string) => publicQuery(query, JSON.parse(argsJson)), ["convex", name], { revalidate: PUBLIC_REVALIDATE, tags: ["public"] });
    readers.set(name, read);
  }
  return read(stableArgs(args)) as Promise<Q["_returnType"]>;
}
