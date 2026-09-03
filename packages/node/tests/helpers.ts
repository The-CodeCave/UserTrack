import { HEADER_NONCE, HEADER_PROJECT, METRICS_PATH, type MetricsRequest, signedHeaders, verify } from "@usertrack/protocol";
import type { CountSource, CountWhere } from "../src/sources.js";

export const PROJECT = "j57abc123";
export const SECRET = "ut_int_testsecret_0123456789abcdef";
export const DAY = 86_400_000;
export const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

/** In-memory count source: rows with a createdAt, filtered by the where bounds. */
export function memorySource(dates: Date[], opts: { timeFilter?: boolean; exact?: boolean } = {}): CountSource & { calls: CountWhere[] } {
  const s: CountSource & { calls: CountWhere[] } = {
    calls: [],
    count: async (where) => {
      s.calls.push(where);
      const n = dates.filter((d) => (!where.createdAtGte || d >= where.createdAtGte) && (!where.createdAtLt || d < where.createdAtLt)).length;
      return opts.exact === false ? { count: n, exact: false } : n;
    },
  };
  if (opts.timeFilter !== undefined) s.timeFilter = opts.timeFilter;
  return s;
}

export async function signedRequest(body: Partial<MetricsRequest> | null = {}, o: { secret?: string; projectId?: string; timestamp?: number; nonce?: string; rawBody?: string; method?: string } = {}) {
  const raw = o.rawBody ?? (body === null ? "" : JSON.stringify({ protocolVersion: 1, ...body }));
  const headers = await signedHeaders(o.secret ?? SECRET, o.projectId ?? PROJECT, { method: "REQUEST", path: METRICS_PATH, body: raw, ...(o.timestamp !== undefined ? { timestamp: o.timestamp } : {}), ...(o.nonce !== undefined ? { nonce: o.nonce } : {}) });
  if (o.projectId !== undefined) headers[HEADER_PROJECT] = o.projectId;
  return new Request("https://app.example.com/api/usertrack/metrics", { method: o.method ?? "POST", headers: { "content-type": "application/json", ...headers }, ...(o.method === "GET" ? {} : { body: raw }) });
}

export async function readSigned(res: Response, req: Request, secret = SECRET) {
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  const sig = res.status === 200 ? await verify(secret, res.headers, { method: "RESPONSE", path: METRICS_PATH, body: text }, { expectedNonce: req.headers.get(HEADER_NONCE)! }) : null;
  return { text, json, sig };
}
