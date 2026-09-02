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
import type * as daily from "../daily.js";
import type * as digest from "../digest.js";
import type * as follows from "../follows.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_benchmarks from "../lib/benchmarks.js";
import type * as lib_digestEmail from "../lib/digestEmail.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_milestones from "../lib/milestones.js";
import type * as lib_retention from "../lib/retention.js";
import type * as lib_spikes from "../lib/spikes.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_trending from "../lib/trending.js";
import type * as lib_trust from "../lib/trust.js";
import type * as profiles from "../profiles.js";
import type * as providers_auth0 from "../providers/auth0.js";
import type * as providers_clerk from "../providers/clerk.js";
import type * as providers_endpoint from "../providers/endpoint.js";
import type * as providers_firebase from "../providers/firebase.js";
import type * as providers_ga4 from "../providers/ga4.js";
import type * as providers_google from "../providers/google.js";
import type * as providers_index from "../providers/index.js";
import type * as providers_manual from "../providers/manual.js";
import type * as providers_plausible from "../providers/plausible.js";
import type * as providers_posthog from "../providers/posthog.js";
import type * as providers_stripe from "../providers/stripe.js";
import type * as providers_supabase from "../providers/supabase.js";
import type * as providers_types from "../providers/types.js";
import type * as public_ from "../public.js";
import type * as saas from "../saas.js";
import type * as seed from "../seed.js";
import type * as sync from "../sync.js";
import type * as trust from "../trust.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  daily: typeof daily;
  digest: typeof digest;
  follows: typeof follows;
  http: typeof http;
  integrations: typeof integrations;
  leaderboard: typeof leaderboard;
  "lib/benchmarks": typeof lib_benchmarks;
  "lib/digestEmail": typeof lib_digestEmail;
  "lib/metrics": typeof lib_metrics;
  "lib/milestones": typeof lib_milestones;
  "lib/retention": typeof lib_retention;
  "lib/spikes": typeof lib_spikes;
  "lib/time": typeof lib_time;
  "lib/trending": typeof lib_trending;
  "lib/trust": typeof lib_trust;
  profiles: typeof profiles;
  "providers/auth0": typeof providers_auth0;
  "providers/clerk": typeof providers_clerk;
  "providers/endpoint": typeof providers_endpoint;
  "providers/firebase": typeof providers_firebase;
  "providers/ga4": typeof providers_ga4;
  "providers/google": typeof providers_google;
  "providers/index": typeof providers_index;
  "providers/manual": typeof providers_manual;
  "providers/plausible": typeof providers_plausible;
  "providers/posthog": typeof providers_posthog;
  "providers/stripe": typeof providers_stripe;
  "providers/supabase": typeof providers_supabase;
  "providers/types": typeof providers_types;
  public: typeof public_;
  saas: typeof saas;
  seed: typeof seed;
  sync: typeof sync;
  trust: typeof trust;
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
