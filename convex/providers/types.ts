export type ProviderKind = "clerk" | "supabase" | "endpoint" | "manual";
export type Trust = "verified" | "unverified" | "pending";

export interface Provider<Config> {
  kind: ProviderKind;
  label: string;
  // Returns an error message or null when the config is well-formed.
  validate(config: unknown): { ok: true; config: Config } | { ok: false; error: string };
  // Trust the provider grants once a fetch succeeds.
  trust(config: Config, saasWebsiteUrl: string): Trust;
  fetchTotalUsers(config: Config): Promise<number>;
  // Secret-free view of the config for the UI.
  publicConfig(config: Config): Record<string, string>;
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function sameSite(a: string, b: string) {
  const ha = hostOf(a);
  const hb = hostOf(b);
  if (!ha || !hb) return false;
  return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
}

export async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${hostOf(url) ?? url}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export function asCount(v: unknown, what: string) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`${what} is not a valid count`);
  return Math.floor(v);
}
