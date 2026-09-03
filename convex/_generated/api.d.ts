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
import type * as cohorts from "../cohorts.js";
import type * as crons from "../crons.js";
import type * as daily from "../daily.js";
import type * as digest from "../digest.js";
import type * as domain_benchmarks from "../domain/benchmarks.js";
import type * as domain_events from "../domain/events.js";
import type * as domain_funnel from "../domain/funnel.js";
import type * as domain_integrations from "../domain/integrations.js";
import type * as domain_metrics from "../domain/metrics.js";
import type * as domain_projects from "../domain/projects.js";
import type * as domain_visibility from "../domain/visibility.js";
import type * as email_growth from "../email/growth.js";
import type * as email_lifecycle from "../email/lifecycle.js";
import type * as email_prefs from "../email/prefs.js";
import type * as email_reports from "../email/reports.js";
import type * as email_resend from "../email/resend.js";
import type * as email_send from "../email/send.js";
import type * as email_templates_index from "../email/templates/index.js";
import type * as email_templates_layout from "../email/templates/layout.js";
import type * as email_testSend from "../email/testSend.js";
import type * as email_token from "../email/token.js";
import type * as email_types from "../email/types.js";
import type * as email_users from "../email/users.js";
import type * as email_webhook from "../email/webhook.js";
import type * as email_webhookSig from "../email/webhookSig.js";
import type * as email_welcome from "../email/welcome.js";
import type * as embeds from "../embeds.js";
import type * as follows from "../follows.js";
import type * as gateway from "../gateway.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_benchmarks from "../lib/benchmarks.js";
import type * as lib_domain from "../lib/domain.js";
import type * as lib_emailRules from "../lib/emailRules.js";
import type * as lib_founder from "../lib/founder.js";
import type * as lib_history from "../lib/history.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_integrationSetup from "../lib/integrationSetup.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_milestones from "../lib/milestones.js";
import type * as lib_nativeProtocol from "../lib/nativeProtocol.js";
import type * as lib_nativeSetup from "../lib/nativeSetup.js";
import type * as lib_retention from "../lib/retention.js";
import type * as lib_shareRules from "../lib/shareRules.js";
import type * as lib_spikes from "../lib/spikes.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_trending from "../lib/trending.js";
import type * as lib_trust from "../lib/trust.js";
import type * as lib_webhooks from "../lib/webhooks.js";
import type * as lib_xApi from "../lib/xApi.js";
import type * as migrations from "../migrations.js";
import type * as native from "../native.js";
import type * as node_postgres from "../node/postgres.js";
import type * as onboarding from "../onboarding.js";
import type * as profiles from "../profiles.js";
import type * as providerRun from "../providerRun.js";
import type * as providers_auth0 from "../providers/auth0.js";
import type * as providers_chargebee from "../providers/chargebee.js";
import type * as providers_clerk from "../providers/clerk.js";
import type * as providers_conversion from "../providers/conversion.js";
import type * as providers_endpoint from "../providers/endpoint.js";
import type * as providers_firebase from "../providers/firebase.js";
import type * as providers_ga4 from "../providers/ga4.js";
import type * as providers_google from "../providers/google.js";
import type * as providers_index from "../providers/index.js";
import type * as providers_lemonsqueezy from "../providers/lemonsqueezy.js";
import type * as providers_manual from "../providers/manual.js";
import type * as providers_native from "../providers/native.js";
import type * as providers_paddle from "../providers/paddle.js";
import type * as providers_plausible from "../providers/plausible.js";
import type * as providers_postgres from "../providers/postgres.js";
import type * as providers_posthog from "../providers/posthog.js";
import type * as providers_revenuecat from "../providers/revenuecat.js";
import type * as providers_stripe from "../providers/stripe.js";
import type * as providers_supabase from "../providers/supabase.js";
import type * as providers_types from "../providers/types.js";
import type * as public_ from "../public.js";
import type * as saas from "../saas.js";
import type * as seed from "../seed.js";
import type * as share from "../share.js";
import type * as social from "../social.js";
import type * as sync from "../sync.js";
import type * as tokens from "../tokens.js";
import type * as trust from "../trust.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  cohorts: typeof cohorts;
  crons: typeof crons;
  daily: typeof daily;
  digest: typeof digest;
  "domain/benchmarks": typeof domain_benchmarks;
  "domain/events": typeof domain_events;
  "domain/funnel": typeof domain_funnel;
  "domain/integrations": typeof domain_integrations;
  "domain/metrics": typeof domain_metrics;
  "domain/projects": typeof domain_projects;
  "domain/visibility": typeof domain_visibility;
  "email/growth": typeof email_growth;
  "email/lifecycle": typeof email_lifecycle;
  "email/prefs": typeof email_prefs;
  "email/reports": typeof email_reports;
  "email/resend": typeof email_resend;
  "email/send": typeof email_send;
  "email/templates/index": typeof email_templates_index;
  "email/templates/layout": typeof email_templates_layout;
  "email/testSend": typeof email_testSend;
  "email/token": typeof email_token;
  "email/types": typeof email_types;
  "email/users": typeof email_users;
  "email/webhook": typeof email_webhook;
  "email/webhookSig": typeof email_webhookSig;
  "email/welcome": typeof email_welcome;
  embeds: typeof embeds;
  follows: typeof follows;
  gateway: typeof gateway;
  http: typeof http;
  integrations: typeof integrations;
  leaderboard: typeof leaderboard;
  "lib/benchmarks": typeof lib_benchmarks;
  "lib/domain": typeof lib_domain;
  "lib/emailRules": typeof lib_emailRules;
  "lib/founder": typeof lib_founder;
  "lib/history": typeof lib_history;
  "lib/identity": typeof lib_identity;
  "lib/integrationSetup": typeof lib_integrationSetup;
  "lib/metrics": typeof lib_metrics;
  "lib/milestones": typeof lib_milestones;
  "lib/nativeProtocol": typeof lib_nativeProtocol;
  "lib/nativeSetup": typeof lib_nativeSetup;
  "lib/retention": typeof lib_retention;
  "lib/shareRules": typeof lib_shareRules;
  "lib/spikes": typeof lib_spikes;
  "lib/time": typeof lib_time;
  "lib/tokens": typeof lib_tokens;
  "lib/trending": typeof lib_trending;
  "lib/trust": typeof lib_trust;
  "lib/webhooks": typeof lib_webhooks;
  "lib/xApi": typeof lib_xApi;
  migrations: typeof migrations;
  native: typeof native;
  "node/postgres": typeof node_postgres;
  onboarding: typeof onboarding;
  profiles: typeof profiles;
  providerRun: typeof providerRun;
  "providers/auth0": typeof providers_auth0;
  "providers/chargebee": typeof providers_chargebee;
  "providers/clerk": typeof providers_clerk;
  "providers/conversion": typeof providers_conversion;
  "providers/endpoint": typeof providers_endpoint;
  "providers/firebase": typeof providers_firebase;
  "providers/ga4": typeof providers_ga4;
  "providers/google": typeof providers_google;
  "providers/index": typeof providers_index;
  "providers/lemonsqueezy": typeof providers_lemonsqueezy;
  "providers/manual": typeof providers_manual;
  "providers/native": typeof providers_native;
  "providers/paddle": typeof providers_paddle;
  "providers/plausible": typeof providers_plausible;
  "providers/postgres": typeof providers_postgres;
  "providers/posthog": typeof providers_posthog;
  "providers/revenuecat": typeof providers_revenuecat;
  "providers/stripe": typeof providers_stripe;
  "providers/supabase": typeof providers_supabase;
  "providers/types": typeof providers_types;
  public: typeof public_;
  saas: typeof saas;
  seed: typeof seed;
  share: typeof share;
  social: typeof social;
  sync: typeof sync;
  tokens: typeof tokens;
  trust: typeof trust;
  webhooks: typeof webhooks;
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
