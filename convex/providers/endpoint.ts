import { checkPublicHttpsUrl } from "../lib/ssrf";
import { asCount, fetchJson, hostOf, hostnameOf, sameSite, IDENTITY_CAP, type LifecycleStage, type Provider, type ProviderMetrics, type Role, type StageIdentities } from "./types";
import { parseMode } from "./conversion";

export interface EndpointConfig { url: string; token: string }

const FIELDS: Record<Role, (keyof ProviderMetrics)[]> = {
  users: ["totalUsers", "newUsers24h", "newUsers7d", "newUsers30d", "activeUsers30d"],
  activation: ["activatedUsers", "activated24h", "activated7d", "activated30d"],
  traffic: ["visitors30d", "sessions30d", "visitorsPrev30d"],
  conversion: ["convertedUsers", "newConverted24h", "newConverted7d", "newConverted30d", "trialUsers", "newTrials7d", "newTrials30d"],
};
const REQUIRED: Record<Role, keyof ProviderMetrics> = { users: "totalUsers", activation: "activatedUsers", traffic: "visitors30d", conversion: "convertedUsers" };
// Optional `identities` object: { signedUp: [{ id, at? }], activated: [...], trial: [...], converted: [...] } — stable ids, never emails.
const IDENTITY_KEYS: Record<Role, { key: string; stage: LifecycleStage }[]> = {
  users: [{ key: "signedUp", stage: "signed_up" }],
  activation: [{ key: "activated", stage: "activated" }],
  traffic: [],
  conversion: [{ key: "trial", stage: "trial" }, { key: "converted", stage: "converted" }],
};

export function parseIdentities(json: Record<string, unknown>, role: Role): StageIdentities[] | undefined {
  const raw = json.identities as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return undefined;
  const out: StageIdentities[] = [];
  for (const { key, stage } of IDENTITY_KEYS[role]) {
    const list = raw[key];
    if (!Array.isArray(list)) continue;
    const ids = list
      .map((x) => (typeof x === "string" || typeof x === "number" ? { id: String(x) } : x && typeof x === "object" && (typeof (x as { id?: unknown }).id === "string" || typeof (x as { id?: unknown }).id === "number") ? { id: String((x as { id: string | number }).id), at: typeof (x as { at?: unknown }).at === "number" ? (x as { at: number }).at : typeof (x as { at?: unknown }).at === "string" ? Date.parse((x as { at: string }).at) || undefined : undefined } : null))
      .filter((x): x is { id: string; at?: number } => x !== null && x.id.trim().length > 0 && !x.id.includes("@"))
      .slice(0, IDENTITY_CAP);
    out.push({ stage, ids, complete: list.length <= IDENTITY_CAP });
  }
  return out.length ? out : undefined;
}

// GET {url} with `Authorization: Bearer {token}` → JSON. Required key depends on role, e.g. { "totalUsers": 1234 }.
// Verified only when the endpoint lives on the SaaS's own domain. Legacy `payingUsers` is accepted as `convertedUsers`.
export const endpoint: Provider<EndpointConfig> = {
  kind: "endpoint",
  label: "JSON endpoint",
  roles: ["users", "activation", "traffic", "conversion"],
  capabilities: ["totalUsers", "usersInRange", "activeUsers", "activation", "traffic", "trial", "converted", "identity"],
  validate(c) {
    const cfg = c as Partial<EndpointConfig>;
    const url = cfg?.url?.trim();
    if (!url || !/^https:\/\//.test(url) || !hostOf(url)) return { ok: false, error: "Enter an https:// endpoint URL" };
    const check = checkPublicHttpsUrl(url, { what: "The endpoint URL", anyPort: true });
    if (!check.ok) return { ok: false, error: check.reason };
    const token = cfg?.token?.trim() ?? "";
    return { ok: true, config: { url, token } };
  },
  trust: ({ url }, site) => (sameSite(url, site) ? "verified" : "unverified"),
  async fetch({ url, token }, role): Promise<ProviderMetrics> {
    const json = await fetchJson(url, {
      headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" },
    });
    if (role === "conversion" && json.convertedUsers === undefined && json.payingUsers !== undefined) json.convertedUsers = json.payingUsers;
    const out: ProviderMetrics = {};
    for (const key of FIELDS[role]) {
      if (json[key] !== undefined) (out as Record<string, unknown>)[key] = asCount(json[key], key);
    }
    if (out[REQUIRED[role]] === undefined) asCount(json[REQUIRED[role]], REQUIRED[role]);
    if (role === "conversion") out.conversionMode = parseMode(json) ?? "active_paid";
    out.identities = parseIdentities(json, role);
    return out;
  },
  publicConfig: ({ url }) => ({ host: hostOf(url) ?? url }),
  hosts: ({ url }) => [hostnameOf(url)],
};
