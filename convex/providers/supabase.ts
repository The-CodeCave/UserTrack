import { asCount, hostOf, type Provider } from "./types";

export interface SupabaseConfig { url: string; serviceKey: string; table?: string }

export const supabase: Provider<SupabaseConfig> = {
  kind: "supabase",
  label: "Supabase",
  validate(c) {
    const cfg = c as Partial<SupabaseConfig>;
    const url = cfg?.url?.trim().replace(/\/$/, "");
    const key = cfg?.serviceKey?.trim();
    const table = cfg?.table?.trim() || undefined;
    if (!url || !hostOf(url)?.endsWith("supabase.co")) return { ok: false, error: "Enter your project URL (https://xxx.supabase.co)" };
    if (!key || key.length < 20) return { ok: false, error: "Enter the service role key" };
    if (table && !/^[a-z_][a-z0-9_]*$/i.test(table)) return { ok: false, error: "Invalid table name" };
    return { ok: true, config: { url, serviceKey: key, table } };
  },
  trust: () => "verified",
  async fetchTotalUsers({ url, serviceKey, table }) {
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    if (!table) {
      const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, { headers });
      if (!res.ok) throw new Error(`${res.status} from Supabase auth`);
      return asCount(Number(res.headers.get("x-total-count")), "Supabase X-Total-Count");
    }
    const res = await fetch(`${url}/rest/v1/${table}?select=id`, {
      method: "HEAD",
      headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
    });
    if (!res.ok) throw new Error(`${res.status} from Supabase table ${table}`);
    const total = res.headers.get("content-range")?.split("/")[1];
    return asCount(Number(total), "Supabase content-range");
  },
  publicConfig: ({ url, table }) => ({ project: hostOf(url) ?? url, source: table ?? "auth.users" }),
};
