// Local end-to-end check against a real HTTP Better Auth server using the built package (dist/):
//   1. plugin initializes inside betterAuth() with the memory adapter and email/password + a second plugin
//   2. sign-up over HTTP works and pushes a signed user.created event to a fake UserTrack receiver
//   3. a signed pull of /usertrack/metrics succeeds and the response signature verifies
//   4. with the receiver down, sign-up still succeeds quickly
import { createServer } from "node:http";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { memoryAdapter } from "better-auth/adapters/memory";
import { bearer } from "better-auth/plugins";
import { userTrack } from "@usertrack/better-auth";
import { HEADER_NONCE, METRICS_PATH, signedHeaders, verify } from "@usertrack/better-auth/protocol";

const PROJECT = "j57e2e";
const SECRET = "ut_int_e2e_0123456789abcdefghijklmnopqrstuv";
const assert = (c, m) => { if (!c) { console.error("✗", m); process.exit(1); } console.log("✓", m); };
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));

// Fake UserTrack receiver
const received = [];
const receiver = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const ok = await verify(SECRET, req.headers, { method: "REQUEST", path: "/api/integrations/better-auth/events", body });
  received.push({ ok: ok.ok, body: JSON.parse(body) });
  res.writeHead(ok.ok ? 202 : 401).end("{}");
});
const receiverPort = await listen(receiver);

const db = { user: [], session: [], account: [], verification: [] };
const auth = betterAuth({
  baseURL: "http://127.0.0.1",
  secret: "host-secret-0123456789abcdefghijklmnop",
  database: memoryAdapter(db),
  emailAndPassword: { enabled: true },
  plugins: [bearer(), userTrack({ projectId: PROJECT, secret: SECRET, endpoint: `http://127.0.0.1:${receiverPort}`, debug: true })],
});
const app = createServer(toNodeHandler(auth));
const port = await listen(app);
const base = `http://127.0.0.1:${port}/api/auth`;
assert((await auth.$context).options.plugins.map((p) => p.id).join(",") === "bearer,usertrack", "plugin initializes next to existing plugins");

// 2. signup over HTTP → event
let res = await fetch(`${base}/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1" }, body: JSON.stringify({ email: "founder@example.com", password: "password-1234", name: "Founder" }) });
assert(res.status === 200, `HTTP sign-up succeeds (${res.status})`);
res = await fetch(`${base}/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1" }, body: JSON.stringify({ email: "founder@example.com", password: "password-1234" }) });
assert(res.status === 200, "HTTP sign-in still works");
await new Promise((r) => setTimeout(r, 300));
assert(received.length === 1 && received[0].ok && received[0].body.type === "user.created", "signed user.created event received by UserTrack");
assert(!JSON.stringify(received[0].body).includes("founder@example.com") && !JSON.stringify(received[0].body).includes(db.user[0].id), "event carries no PII / raw id");

// 3. signed pull
const body = JSON.stringify({ protocolVersion: 1, days: 3 });
const headers = await signedHeaders(SECRET, PROJECT, { method: "REQUEST", path: METRICS_PATH, body });
res = await fetch(`${base}${METRICS_PATH}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
const text = await res.text();
assert(res.status === 200, `metrics endpoint answers 200 (${res.status} ${text.slice(0, 80)})`);
const metrics = JSON.parse(text);
assert(metrics.totalUsers === 1 && metrics.newUsers["24h"] === 1 && metrics.daily.length === 3, "metrics are correct");
assert((await verify(SECRET, res.headers, { method: "RESPONSE", path: METRICS_PATH, body: text }, { expectedNonce: headers[HEADER_NONCE] })).ok, "response signature verifies (bound to request nonce)");
const bad = await fetch(`${base}${METRICS_PATH}`, { method: "POST", headers: { "content-type": "application/json", ...(await signedHeaders("ut_int_wrong", PROJECT, { method: "REQUEST", path: METRICS_PATH, body })) }, body });
assert(bad.status === 401, "wrong secret is rejected with 401");

// 4. UserTrack down → signup unaffected
receiver.close();
const t0 = Date.now();
res = await fetch(`${base}/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1" }, body: JSON.stringify({ email: "second@example.com", password: "password-1234", name: "Second" }) });
assert(res.status === 200 && Date.now() - t0 < 1500, `sign-up succeeds with UserTrack down (${Date.now() - t0}ms)`);
app.close();
console.log("e2e OK");
process.exit(0);
