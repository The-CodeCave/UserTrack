// Long-running sample app for manual / tunnel testing of the native SDK (users + activation + conversion from an in-memory "db"):
//   USERTRACK_PROJECT_ID=… USERTRACK_SECRET=… PORT=4322 node serve.mjs   → mount is http://127.0.0.1:4322/api/usertrack/metrics
import { createServer } from "node:http";
import { createTracker, createUserTrackHandler, toNodeHandler } from "@usertrack/node";

const port = Number(process.env.PORT ?? 4322);
const day = 86_400_000;
const users = Array.from({ length: 40 }, (_, i) => ({ id: `seed-${i}`, createdAt: new Date(Date.now() - Math.floor(i * i * 0.6) * day), activatedAt: i % 2 ? new Date(Date.now() - i * day) : null, paidAt: i % 5 === 0 ? new Date(Date.now() - i * day) : null }));
const by = (field) => ({ count: async ({ createdAtGte, createdAtLt }) => users.filter((u) => u[field] && (!createdAtGte || u[field] >= createdAtGte) && (!createdAtLt || u[field] < createdAtLt)).length });
const opts = { projectId: process.env.USERTRACK_PROJECT_ID, secret: process.env.USERTRACK_SECRET, endpoint: process.env.USERTRACK_ENDPOINT, source: "custom", debug: true };
const handler = toNodeHandler(createUserTrackHandler({ ...opts, users: by("createdAt"), activation: by("activatedAt"), conversion: { converted: by("paidAt") } }));
const tracker = createTracker(opts);
createServer((req, res) => {
  if (req.url === "/api/usertrack/metrics") return handler(req, res);
  if (req.url === "/signup" && req.method === "POST") { const u = { id: `u-${Date.now()}`, createdAt: new Date(), activatedAt: null, paidAt: null }; users.push(u); tracker.track("user.created", { id: u.id }); return res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id: u.id })); }
  res.writeHead(200, { "content-type": "text/plain" }).end("Native SDK sample app (@usertrack/node) — POST /signup to add a user\n");
}).listen(port, () => console.log(`sample app on http://127.0.0.1:${port}, users: ${users.length}`));
