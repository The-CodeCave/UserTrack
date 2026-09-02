import { asCount, fetchJson, hostOf, IDENTITY_CAP, type HistoryPoint, type Provider, type ProviderMetrics, type StageIdentities } from "./types";

export interface PostHogConfig { host: string; projectId: string; apiKey: string; activationEvent?: string }

async function hogql(cfg: PostHogConfig, query: string) {
  const json = await fetchJson<{ results?: unknown[][] }>(`${cfg.host}/api/projects/${cfg.projectId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  return json.results ?? [];
}

const first = (rows: unknown[][], what: string) => asCount(rows[0]?.[0] ?? 0, what);

const daily = (rows: unknown[][], what: string): HistoryPoint[] =>
  rows.map((r) => ({ day: String(r[0]).slice(0, 10), value: asCount(r[1], what) }));

// Identified distinct_ids (what the product passed to posthog.identify(userId)) of the newest activated persons, so the
// cohort engine can match them with the identity source. Anonymous/device ids are skipped. Bounded to IDENTITY_CAP rows.
async function activationIdentities(cfg: PostHogConfig): Promise<StageIdentities[]> {
  const rows = await hogql(cfg, `select distinct_id, min(timestamp) as first_at from events where event = '${cfg.activationEvent}' and distinct_id not like '%-%-%-%-%' and length(distinct_id) < 128 group by distinct_id order by first_at desc limit ${IDENTITY_CAP + 1}`);
  const ids = rows.slice(0, IDENTITY_CAP).map((r) => ({ id: String(r[0]), at: Date.parse(String(r[1]).replace(" ", "T") + "Z") || undefined }));
  return [{ stage: "activated", ids, complete: rows.length <= IDENTITY_CAP }];
}

// PostHog HogQL query API with a personal API key (query:read). Event names are validated to exclude quotes.
export const posthog: Provider<PostHogConfig> = {
  kind: "posthog",
  label: "PostHog",
  roles: ["activation", "traffic"],
  capabilities: ["activation", "traffic", "history", "identity"],
  validate(c, role) {
    const cfg = c as Partial<PostHogConfig>;
    const host = (cfg?.host?.trim() || "https://us.posthog.com").replace(/\/+$/, "");
    const projectId = cfg?.projectId?.trim() ?? "";
    const apiKey = cfg?.apiKey?.trim() ?? "";
    const activationEvent = cfg?.activationEvent?.trim() || undefined;
    if (!/^https:\/\//.test(host) || !hostOf(host)) return { ok: false, error: "Host must be an https URL (e.g. https://eu.posthog.com)" };
    if (!/^\d+$/.test(projectId)) return { ok: false, error: "Enter the numeric project ID" };
    if (!apiKey) return { ok: false, error: "Enter a personal API key" };
    if (activationEvent && (activationEvent.length > 120 || activationEvent.includes("'"))) return { ok: false, error: "Invalid event name" };
    if (role === "activation" && !activationEvent) return { ok: false, error: "Activation needs an event name" };
    return { ok: true, config: { host, projectId, apiKey, activationEvent } };
  },
  trust: () => "verified",
  async fetch(cfg, role): Promise<ProviderMetrics> {
    if (role === "activation") {
      const q = (where = "") => hogql(cfg, `select count(distinct person_id) from events where event = '${cfg.activationEvent}'${where}`);
      const [all, d1, d7, d30] = await Promise.all([q(), q(" and timestamp >= now() - interval 1 day"), q(" and timestamp >= now() - interval 7 day"), q(" and timestamp >= now() - interval 30 day")]);
      const identities = await activationIdentities(cfg).catch(() => undefined);
      return { activatedUsers: first(all, "PostHog activated"), activated24h: first(d1, "PostHog activated"), activated7d: first(d7, "PostHog activated"), activated30d: first(d30, "PostHog activated"), identities };
    }
    const [cur, prev] = await Promise.all([
      hogql(cfg, "select count(distinct person_id), count(distinct $session_id) from events where event = '$pageview' and timestamp >= now() - interval 30 day"),
      hogql(cfg, "select count(distinct person_id) from events where event = '$pageview' and timestamp >= now() - interval 60 day and timestamp < now() - interval 30 day"),
    ]);
    return { visitors30d: first(cur, "PostHog visitors"), sessions30d: asCount(cur[0]?.[1] ?? 0, "PostHog sessions"), visitorsPrev30d: first(prev, "PostHog visitors") };
  },
  async fetchHistory(cfg, role, days) {
    const ev = role === "activation" ? cfg.activationEvent : "$pageview";
    const rows = await hogql(cfg, `select toDate(timestamp) as day, count(distinct person_id) from events where event = '${ev}' and timestamp >= now() - interval ${Math.floor(days)} day group by day order by day`);
    const points = daily(rows, "PostHog daily count");
    if (role !== "activation") return { metric: "visitors", points };
    const all = first(await hogql(cfg, `select count(distinct person_id) from events where event = '${ev}'`), "PostHog activated");
    let running = Math.max(0, all - points.reduce((s, p) => s + p.value, 0));
    return { metric: "activatedUsers", points: points.map((p) => ({ day: p.day, value: (running += p.value) })) };
  },
  publicConfig: ({ host, projectId, activationEvent }) => ({ host: hostOf(host) ?? host, project: projectId, event: activationEvent ?? "—" }),
};
