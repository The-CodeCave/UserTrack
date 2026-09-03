// Local end-to-end check against a real HTTP server using the built package (dist/):
//   1. createUserTrackHandler mounted with toNodeHandler on plain node:http, backed by an in-memory "database"
//   2. a signed pull of /api/usertrack/metrics succeeds, carries users + activation + conversion, and the response signature verifies
//   3. a wrong secret is rejected with 401
//   4. the tracker pushes a signed user.created event to a fake UserTrack receiver; with the receiver down, track() still returns instantly
import { createServer } from "node:http";
import { createTracker, createUserTrackHandler, toNodeHandler } from "@usertrack/node";
import { EVENTS_PATH, HEADER_NONCE, METRICS_PATH, signedHeaders, verify } from "@usertrack/protocol";

const PROJECT = "j57e2e";
const SECRET = "ut_int_e2e_0123456789abcdefghijklmnopqrstuv";
const assert = (c, m) => { if (!c) { console.error("✗", m); process.exit(1); } console.log("✓", m); };
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const day = 86_400_000;

// "database": one row per user with createdAt / activatedAt / paidAt
const users = Array.from({ length: 40 }, (_, i) => ({ id: `u${i}`, createdAt: new Date(Date.now() - Math.floor(i * i * 0.6) * day), activatedAt: i % 2 ? new Date(Date.now() - i * day) : null, paidAt: i % 5 === 0 ? new Date(Date.now() - i * day) : null }));
const by = (field) => ({ count: async ({ createdAtGte, createdAtLt }) => users.filter((u) => u[field] && (!createdAtGte || u[field] >= createdAtGte) && (!createdAtLt || u[field] < createdAtLt)).length });

// Fake UserTrack receiver
const received = [];
const receiver = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const ok = await verify(SECRET, req.headers, { method: "REQUEST", path: EVENTS_PATH, body });
  received.push({ ok: ok.ok, body: JSON.parse(body) });
  res.writeHead(ok.ok ? 202 : 401).end("{}");
});
const receiverPort = await listen(receiver);

const usertrack = createUserTrackHandler({ projectId: PROJECT, secret: SECRET, source: "custom", users: by("createdAt"), activation: by("activatedAt"), conversion: { converted: by("paidAt") }, debug: true });
const app = createServer((req, res) => (req.url === "/api/usertrack/metrics" ? toNodeHandler(usertrack)(req, res) : res.writeHead(404).end()));
const port = await listen(app);
const url = `http://127.0.0.1:${port}/api/usertrack/metrics`;

// 2. signed pull
const body = JSON.stringify({ protocolVersion: 1, days: 3 });
const headers = await signedHeaders(SECRET, PROJECT, { method: "REQUEST", path: METRICS_PATH, body });
let res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
const text = await res.text();
assert(res.status === 200, `metrics endpoint answers 200 (${res.status} ${text.slice(0, 80)})`);
const m = JSON.parse(text);
assert(m.source === "custom" && m.users.totalUsers === 40 && m.users.daily.length === 3 && m.activation.activatedUsers === 20 && m.conversion.convertedUsers === 8, "users + activation + conversion are correct");
assert(m.capabilities.roles.join(",") === "users,activation,conversion", "capabilities list every role");
assert((await verify(SECRET, res.headers, { method: "RESPONSE", path: METRICS_PATH, body: text }, { expectedNonce: headers[HEADER_NONCE] })).ok, "response signature verifies (bound to request nonce)");
assert(!text.includes("u1\"") , "response carries no user ids");

// 3. wrong secret
const bad = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(await signedHeaders("ut_int_wrong", PROJECT, { method: "REQUEST", path: METRICS_PATH, body })) }, body });
assert(bad.status === 401, "wrong secret is rejected with 401");

// 4. push
const tracker = createTracker({ projectId: PROJECT, secret: SECRET, endpoint: `http://127.0.0.1:${receiverPort}`, source: "custom", debug: true });
assert(await tracker.deliver("user.created", { id: "founder-1" }), "signed user.created event delivered to UserTrack");
assert(received.length === 1 && received[0].ok && received[0].body.type === "user.created" && !JSON.stringify(received[0].body).includes("founder-1"), "event verified by the receiver and carries no raw id");
receiver.close();
const t0 = Date.now();
tracker.track("user.activated", { id: "founder-1" });
assert(Date.now() - t0 < 50, `track() returns immediately with UserTrack down (${Date.now() - t0}ms)`);
await new Promise((r) => setTimeout(r, 100));
app.close();
console.log("e2e OK");
process.exit(0);
