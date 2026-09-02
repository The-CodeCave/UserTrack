import { asCount, type Provider } from "./types";

export interface ManualConfig { totalUsers: number }

// Self-reported. Never ranked as verified.
export const manual: Provider<ManualConfig> = {
  kind: "manual",
  label: "Manual (self-reported)",
  roles: ["users"],
  capabilities: ["totalUsers"],
  validate(c) {
    try {
      return { ok: true, config: { totalUsers: asCount(Number((c as Partial<ManualConfig>)?.totalUsers), "Total users") } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
  trust: () => "unverified",
  fetch: async ({ totalUsers }) => ({ totalUsers }),
  publicConfig: ({ totalUsers }) => ({ reported: String(totalUsers) }),
};
