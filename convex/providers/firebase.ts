import { asCount, fetchJson, type Provider, type ProviderMetrics } from "./types";
import { googleAccessToken, parseServiceAccount } from "./google";

export interface FirebaseConfig { serviceAccount: string; projectId?: string }

function project(cfg: FirebaseConfig) {
  return cfg.projectId || parseServiceAccount(cfg.serviceAccount).project_id || "";
}

// Firebase Auth via Identity Toolkit accounts:query (recordsCount only, no user info).
export const firebase: Provider<FirebaseConfig> = {
  kind: "firebase",
  label: "Firebase",
  roles: ["users"],
  capabilities: ["totalUsers"],
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
    return { ok: true, config: { serviceAccount, projectId } };
  },
  trust: () => "verified",
  async fetch(cfg): Promise<ProviderMetrics> {
    const token = await googleAccessToken(parseServiceAccount(cfg.serviceAccount), "https://www.googleapis.com/auth/identitytoolkit");
    const json = await fetchJson(`https://identitytoolkit.googleapis.com/v1/projects/${project(cfg)}/accounts:query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ returnUserInfo: false }),
    });
    return { totalUsers: asCount(json.recordsCount, "Firebase recordsCount") };
  },
  publicConfig: (cfg) => ({ project: project(cfg), account: parseServiceAccount(cfg.serviceAccount).client_email }),
};
