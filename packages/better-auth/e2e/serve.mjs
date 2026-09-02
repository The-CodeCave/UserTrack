// Long-running sample Better Auth app for manual / tunnel testing:
//   USERTRACK_PROJECT_ID=… USERTRACK_SECRET=… BASE_URL=https://<tunnel> PORT=4321 node serve.mjs
import { createServer } from "node:http";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { memoryAdapter } from "better-auth/adapters/memory";
import { userTrack } from "@usertrack/better-auth";

const port = Number(process.env.PORT ?? 4321);
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;
const db = { user: [], session: [], account: [], verification: [] };
const day = 86_400_000;
// A few historical users so windows and history are non-trivial.
for (let i = 0; i < 40; i++) db.user.push({ id: `seed-${i}`, email: `seed${i}@example.com`, emailVerified: true, name: `Seed ${i}`, createdAt: new Date(Date.now() - Math.floor(i * i * 0.6) * day), updatedAt: new Date() });
const auth = betterAuth({
  baseURL,
  trustedOrigins: [baseURL],
  secret: process.env.BETTER_AUTH_SECRET ?? "sample-secret-0123456789abcdefghijklmnop",
  database: memoryAdapter(db),
  emailAndPassword: { enabled: true },
  plugins: [userTrack({ projectId: process.env.USERTRACK_PROJECT_ID, secret: process.env.USERTRACK_SECRET, endpoint: process.env.USERTRACK_ENDPOINT, debug: true })],
});
const handler = toNodeHandler(auth);
createServer((req, res) => {
  if (req.url === "/" ) return res.writeHead(200, { "content-type": "text/plain" }).end("Better Auth sample app with @usertrack/better-auth\n");
  return handler(req, res);
}).listen(port, () => console.log(`sample app on ${baseURL} (local :${port}), users: ${db.user.length}`));
