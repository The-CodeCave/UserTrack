import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { userTrack, type UserTrackPluginOptions } from "../src/index.js";
import { HEADER_PROJECT, METRICS_PATH, type MetricsRequest, signedHeaders } from "../src/protocol.js";

export const PROJECT = "j57abc123";
export const SECRET = "ut_int_testsecret_0123456789abcdef";
export const BASE = "http://localhost:3000";

export function makeAuth(opts: Partial<UserTrackPluginOptions> = {}, extra: Record<string, unknown> = {}) {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: BASE,
    secret: "better-auth-secret-for-tests-0123456789",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [userTrack({ projectId: PROJECT, secret: SECRET, events: false, ...opts })],
    ...extra,
  });
  return { auth, db };
}

export async function signUp(auth: ReturnType<typeof makeAuth>["auth"], email: string, createdAt?: Date) {
  const res = await auth.api.signUpEmail({ body: { email, password: "password-1234", name: "Test" } });
  return res.user;
}

/** Seeds users directly into the memory store with controlled createdAt values. */
export function seedUsers(db: Record<string, Record<string, unknown>[]>, dates: Date[], extra: Record<string, unknown> = {}) {
  for (const [i, d] of dates.entries()) db.user!.push({ id: `seed-${db.user!.length}-${i}`, email: `seed${db.user!.length}${i}@example.com`, emailVerified: false, name: "Seed", createdAt: d, updatedAt: d, ...extra });
}

export async function metricsRequest(auth: ReturnType<typeof makeAuth>["auth"], body: Partial<MetricsRequest> = {}, o: { secret?: string; projectId?: string; timestamp?: number; nonce?: string; rawBody?: string } = {}) {
  const raw = o.rawBody ?? JSON.stringify({ protocolVersion: 1, ...body });
  const headers = await signedHeaders(o.secret ?? SECRET, o.projectId ?? PROJECT, { method: "REQUEST", path: METRICS_PATH, body: raw, ...(o.timestamp !== undefined ? { timestamp: o.timestamp } : {}), ...(o.nonce !== undefined ? { nonce: o.nonce } : {}) });
  if (o.projectId !== undefined) headers[HEADER_PROJECT] = o.projectId;
  const res = await auth.handler(new Request(`${BASE}/api/auth${METRICS_PATH}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw }));
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { res, text, json: json as Record<string, unknown> | null };
}
