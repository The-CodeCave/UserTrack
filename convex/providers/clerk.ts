import { asCount, fetchJson, type Provider } from "./types";

export interface ClerkConfig { secretKey: string }

export const clerk: Provider<ClerkConfig> = {
  kind: "clerk",
  label: "Clerk",
  validate(c) {
    const key = (c as Partial<ClerkConfig>)?.secretKey?.trim();
    if (!key || !/^sk_(live|test)_/.test(key)) return { ok: false, error: "Enter a Clerk secret key (sk_live_… or sk_test_…)" };
    return { ok: true, config: { secretKey: key } };
  },
  trust: () => "verified",
  async fetchTotalUsers({ secretKey }) {
    const json = await fetchJson("https://api.clerk.com/v1/users/count", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    return asCount(json.total_count, "Clerk total_count");
  },
  publicConfig: ({ secretKey }) => ({ key: `${secretKey.slice(0, 8)}…${secretKey.slice(-4)}` }),
};
