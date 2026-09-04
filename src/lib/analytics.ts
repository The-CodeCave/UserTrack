// Rybbit analytics: configuration, the typed event catalog and thin wrappers around `window.rybbit`.
// Every browser call is a no-op until the script has loaded; identify/reset are replayed once it has.

export const RYBBIT_HOST = (process.env.NEXT_PUBLIC_RYBBIT_HOST || "https://rybbit.internal.thecodecave.de").replace(/\/$/, "");
export const RYBBIT_SITE_ID = process.env.NEXT_PUBLIC_RYBBIT_SITE_ID ?? "753f44fa9c50";
export const ANALYTICS_ENABLED = RYBBIT_SITE_ID !== "" && process.env.NODE_ENV !== "test";
// Paths never sent (machine endpoints) and paths sent with the token stripped from the URL.
export const SKIP_PATTERNS = ["/api/**", "/embed/**", "/mcp"];
export const MASK_PATTERNS = ["/email/preferences*", "/reset-password*"];

export type AuthMethod = "email" | "google" | "github" | "x";
export type CtaLocation = "hero" | "how-it-works" | "footer" | "pricing";
export type FollowTarget = "saas" | "profile";

// Browser events. Props are primitives only — never emails, handles or third-party URLs.
export type Events = {
  cta_click: { location: CtaLocation };
  board_filter_change: { board: string; window: string; category: string };
  search: { termLength: number; results: number };
  compare_opened: undefined;
  share_card_viewed: { kind: string };
  badge_snippet_copied: undefined;
  embed_snippet_copied: { widget: string };
  dataset_downloaded: { dataset: string; format: "json" | "csv" };
  sign_up_started: { method: AuthMethod };
  sign_up_completed: { method: AuthMethod };
  sign_in: { method: AuthMethod };
  email_verification_resent: undefined;
  sign_out: undefined;
  onboarding_step: { step: string; platform?: string };
  onboarding_completed: undefined;
  project_created: { source: "form" | "mcp" | "trustmrr" };
  project_updated: { fields: string };
  project_published: undefined;
  project_unpublished: undefined;
  trustmrr_import_started: undefined;
  trustmrr_import_succeeded: { unmappedCount: number };
  trustmrr_import_failed: { reason: string };
  integration_connect_opened: { provider: string; role: string };
  integration_test: { provider: string; ok: boolean };
  integration_connected: { provider: string; role: string; verification: string };
  integration_removed: { provider: string };
  sync_triggered: { role: string };
  backfill_triggered: undefined;
  postgres_wizard_step: { step: number };
  share_card_downloaded: { kind: string; range: string };
  share_intent_opened: { network: string };
  x_connected: undefined;
  x_disconnected: undefined;
  follow: { targetType: FollowTarget };
  unfollow: { targetType: FollowTarget };
  token_created: { type: string; origin: string };
  token_revoked: undefined;
  mcp_config_copied: { client: string };
  webhook_created: { events: string };
  webhook_test_sent: undefined;
  notification_pref_changed: { key: string; value: string | number | boolean };
  account_export_downloaded: undefined;
  account_deleted: undefined;
};

// Server-side events sent from Next.js route handlers (`src/lib/analytics-server.ts`).
export type ServerEvents = {
  api_request: { category: string; status: number; authenticated: boolean };
  mcp_tool_called: { tool: string; ok: boolean; code?: string };
  badge_rendered: { type: string };
  embed_rendered: { widget: string };
  native_event_ingested: undefined;
};

// Events sent from Convex actions (`convex/lib/analytics.ts`).
export type ConvexEvents = {
  webhook_delivered: { ok: boolean; attempt: number };
  sync_completed: { provider: string; role: string; ok: boolean };
};

// The catalog as a value, so docs and tests can enumerate it; `satisfies` keeps it in sync with `Events`.
export const EVENTS = {
  cta_click: "cta_click",
  board_filter_change: "board_filter_change",
  search: "search",
  compare_opened: "compare_opened",
  share_card_viewed: "share_card_viewed",
  badge_snippet_copied: "badge_snippet_copied",
  embed_snippet_copied: "embed_snippet_copied",
  dataset_downloaded: "dataset_downloaded",
  sign_up_started: "sign_up_started",
  sign_up_completed: "sign_up_completed",
  sign_in: "sign_in",
  email_verification_resent: "email_verification_resent",
  sign_out: "sign_out",
  onboarding_step: "onboarding_step",
  onboarding_completed: "onboarding_completed",
  project_created: "project_created",
  project_updated: "project_updated",
  project_published: "project_published",
  project_unpublished: "project_unpublished",
  trustmrr_import_started: "trustmrr_import_started",
  trustmrr_import_succeeded: "trustmrr_import_succeeded",
  trustmrr_import_failed: "trustmrr_import_failed",
  integration_connect_opened: "integration_connect_opened",
  integration_test: "integration_test",
  integration_connected: "integration_connected",
  integration_removed: "integration_removed",
  sync_triggered: "sync_triggered",
  backfill_triggered: "backfill_triggered",
  postgres_wizard_step: "postgres_wizard_step",
  share_card_downloaded: "share_card_downloaded",
  share_intent_opened: "share_intent_opened",
  x_connected: "x_connected",
  x_disconnected: "x_disconnected",
  follow: "follow",
  unfollow: "unfollow",
  token_created: "token_created",
  token_revoked: "token_revoked",
  mcp_config_copied: "mcp_config_copied",
  webhook_created: "webhook_created",
  webhook_test_sent: "webhook_test_sent",
  notification_pref_changed: "notification_pref_changed",
  account_export_downloaded: "account_export_downloaded",
  account_deleted: "account_deleted",
} as const satisfies { [K in keyof Events]: K };

export const SERVER_EVENTS = ["api_request", "mcp_tool_called", "badge_rendered", "embed_rendered", "native_event_ingested", "webhook_delivered", "sync_completed"] as const satisfies readonly (keyof ServerEvents | keyof ConvexEvents)[];

export type EventProps = Record<string, string | number | boolean | undefined> | undefined;
type Args<P> = P extends undefined ? [] : [props: P];

export interface Rybbit {
  event(name: string, properties?: Record<string, string | number>): void;
  pageview(): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  clearUserId(): void;
  getUserId(): string | null;
}

declare global {
  interface Window { rybbit?: Rybbit }
}

// Rybbit accepts strings and numbers only; booleans become "true" / "false", undefined is dropped.
export function cleanProps(props: EventProps): Record<string, string | number> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    out[k] = typeof v === "boolean" ? String(v) : v;
  }
  return out;
}

const rybbit = () => (typeof window === "undefined" ? undefined : window.rybbit);

export function track<E extends keyof Events>(event: E, ...args: Args<Events[E]>) {
  const r = rybbit();
  if (!r) return;
  try {
    r.event(event, cleanProps(args[0] as EventProps));
  } catch {}
}

// Pseudonymous Better Auth user id only, never an email. Kept until the script is ready, then replayed.
let pendingUser: string | null | undefined;

export function identify(userId: string) {
  pendingUser = userId;
  flushIdentity();
}

export function reset() {
  pendingUser = null;
  flushIdentity();
}

export function flushIdentity() {
  const r = rybbit();
  if (!r || pendingUser === undefined) return;
  try {
    if (pendingUser) r.identify(pendingUser);
    else if (r.getUserId()) r.clearUserId();
    pendingUser = undefined;
  } catch {}
}
