/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_time from "../lib/time.js";
import type * as profiles from "../profiles.js";
import type * as providers_clerk from "../providers/clerk.js";
import type * as providers_endpoint from "../providers/endpoint.js";
import type * as providers_index from "../providers/index.js";
import type * as providers_manual from "../providers/manual.js";
import type * as providers_supabase from "../providers/supabase.js";
import type * as providers_types from "../providers/types.js";
import type * as public_ from "../public.js";
import type * as saas from "../saas.js";
import type * as seed from "../seed.js";
import type * as sync from "../sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  integrations: typeof integrations;
  leaderboard: typeof leaderboard;
  "lib/metrics": typeof lib_metrics;
  "lib/time": typeof lib_time;
  profiles: typeof profiles;
  "providers/clerk": typeof providers_clerk;
  "providers/endpoint": typeof providers_endpoint;
  "providers/index": typeof providers_index;
  "providers/manual": typeof providers_manual;
  "providers/supabase": typeof providers_supabase;
  "providers/types": typeof providers_types;
  public: typeof public_;
  saas: typeof saas;
  seed: typeof seed;
  sync: typeof sync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
