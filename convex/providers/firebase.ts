import { asCount, fetchJson, DAY_MS, dayKey, type History, type Provider, type ProviderCapabilities, type ProviderMetrics } from "./types";
import { googleAccessToken, parseServiceAccount } from "./google";

export interface FirebaseConfig { serviceAccount: string; projectId?: string; scanSignups?: boolean }

const PAGE = 1000;
// Signup ranges need createdAt per account; the scan is capped so huge projects fall back to snapshot deltas.
export const FIREBASE_SCAN_LIMIT = 100_000;
const SCOPE = "https://www.googleapis.com/auth/identitytoolkit";

function project(cfg: FirebaseConfig) {
  return cfg.projectId || parseServiceAccount(cfg.serviceAccount).project_id || "";
}

async function total(cfg: FirebaseConfig, token: string) {
  const json = await fetchJson(`https://identitytoolkit.googleapis.com/v1/projects/${project(cfg)}/accounts:query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ returnUserInfo: false }),
  });
  return asCount(json.recordsCount, "Firebase recordsCount");
}

// Pages through accounts:batchGet and keeps only creation timestamps; user records are discarded immediately.
async function createdAtTimestamps(cfg: FirebaseConfig, token: string, max: number) {
  const out: number[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ maxResults: String(PAGE), ...(pageToken ? { nextPageToken: pageToken } : {}) });
    const json = await fetchJson<{ users?: { createdAt?: string }[]; nextPageToken?: string }>(`https://identitytoolkit.googleapis.com/v1/projects/${project(cfg)}/accounts:batchGet?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    for (const u of json.users ?? []) {
      const t = Number(u.createdAt);
      if (Number.isFinite(t) && t > 0) out.push(t);
    }
    pageToken = json.nextPageToken;
  } while (pageToken && out.length < max);
  return out;
}

const canScan = (cfg: FirebaseConfig, n: number) => cfg.scanSignups !== false && n <= FIREBASE_SCAN_LIMIT;

// Firebase Auth via Identity Toolkit: recordsCount for the total; createdAt scan (≤100k accounts) for signup windows + history.
export const firebase: Provider<FirebaseConfig> = {
  kind: "firebase",
  label: "Firebase",
  roles: ["users"],
  capabilities: ["totalUsers", "usersInRange", "history"],
  validate(c) {
    const cfg = c as Partial<FirebaseConfig>;
    const serviceAccount = cfg?.serviceAccount?.trim() ?? "";
    let sa;
    try {
      sa = parseServiceAccount(serviceAccount);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    const projectId = cfg?.projectId?.trim() || sa.project_id || "";
    if (!/^[a-z0-9-]+$/.test(projectId)) return { ok: false, error: "Enter a Firebase project ID (lowercase letters, digits, dashes)" };
    return { ok: true, config: { serviceAccount, projectId, scanSignups: cfg?.scanSignups === false ? false : undefined } };
  },
  trust: () => "verified",
  describe(cfg, role): ProviderCapabilities {
    const scan = cfg.scanSignups !== false;
    return { totalUsers: role === "users", createdUsers: scan, historicalUsers: scan, activationEvents: false, retention: false, traffic: false, trial: false, converted: false, identity: false };
  },
  async fetch(cfg): Promise<ProviderMetrics> {
    const token = await googleAccessToken(parseServiceAccount(cfg.serviceAccount), SCOPE);
    const totalUsers = await total(cfg, token);
    if (!canScan(cfg, totalUsers)) return { totalUsers };
    const now = Date.now();
    const ts = await createdAtTimestamps(cfg, token, FIREBASE_SCAN_LIMIT);
    const since = (d: number) => ts.filter((t) => t >= now - d * DAY_MS).length;
    return { totalUsers, newUsers24h: since(1), newUsers7d: since(7), newUsers30d: since(30) };
  },
  async fetchHistory(cfg, _role, days): Promise<History | null> {
    const token = await googleAccessToken(parseServiceAccount(cfg.serviceAccount), SCOPE);
    const n = await total(cfg, token);
    if (!canScan(cfg, n)) return null;
    const ts = await createdAtTimestamps(cfg, token, FIREBASE_SCAN_LIMIT);
    const start = Date.now() - days * DAY_MS;
    const perDay = new Map<string, number>();
    for (const t of ts) if (t >= start) perDay.set(dayKey(t), (perDay.get(dayKey(t)) ?? 0) + 1);
    const points = [];
    for (let i = 0; i <= days; i++) {
      const day = dayKey(start + i * DAY_MS);
      points.push({ day, value: perDay.get(day) ?? 0 });
    }
    return { metric: "newUsers", points };
  },
  publicConfig: (cfg) => ({ project: project(cfg), account: parseServiceAccount(cfg.serviceAccount).client_email, signups: cfg.scanSignups === false ? "snapshot deltas" : `createdAt scan (≤${FIREBASE_SCAN_LIMIT / 1000}k accounts)` }),
};
