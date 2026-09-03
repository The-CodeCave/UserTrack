// Best-effort Rybbit events from Convex actions. Opt-in per deployment via RYBBIT_SITE_ID; 2 s timeout; never throws.
export type ConvexEvents = {
  webhook_delivered: { ok: boolean; attempt: number };
  sync_completed: { provider: string; role: string; ok: boolean };
};

const DEFAULT_HOST = "https://rybbit.internal.thecodecave.de";
const TIMEOUT_MS = 2_000;

export function analyticsConfig(env: Record<string, string | undefined> = process.env) {
  const siteId = env.RYBBIT_SITE_ID;
  if (!siteId) return null;
  let hostname = "usertrack.dev";
  try { hostname = new URL(env.SITE_URL ?? "").host || hostname; } catch {}
  return { host: (env.RYBBIT_HOST || DEFAULT_HOST).replace(/\/$/, ""), siteId, apiKey: env.RYBBIT_API_KEY || undefined, hostname };
}

export async function trackEvent<E extends keyof ConvexEvents>(event: E, props: ConvexEvents[E], env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch) {
  const cfg = analyticsConfig(env);
  if (!cfg) return;
  const properties: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(props)) properties[k] = typeof v === "boolean" ? String(v) : v;
  try {
    await fetchImpl(`${cfg.host}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({ site_id: cfg.siteId, type: "custom_event", hostname: cfg.hostname, pathname: "/_convex", event_name: event, user_agent: "UserTrack/1.0 (convex)", properties: JSON.stringify(properties) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {}
}
