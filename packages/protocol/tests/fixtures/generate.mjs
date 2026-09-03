// Independent Node-crypto implementation of protocol v1, used to freeze fixtures for @usertrack/protocol and the UserTrack server tests.
import { createHash, createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";

const secret = "ut_int_fixture_secret_0123456789abcdef";
const cases = [
  { name: "metrics request", method: "REQUEST", path: "/usertrack/metrics", timestamp: 1788307200000, nonce: "0f1e2d3c4b5a69788796a5b4c3d2e1f0", body: '{"protocolVersion":1,"days":30}' },
  { name: "metrics response", method: "RESPONSE", path: "/usertrack/metrics", timestamp: 1788307200500, nonce: "0f1e2d3c4b5a69788796a5b4c3d2e1f0", body: '{"protocolVersion":1,"pluginVersion":"0.1.0","provider":"better-auth","projectId":"j57abc","generatedAt":"2026-09-01T08:00:00.500Z","totalUsers":12481,"newUsers":{"24h":84,"7d":491,"30d":1832},"capabilities":{"exactCounts":true,"history":true,"anonymousExcluded":false}}' },
  { name: "event push", method: "REQUEST", path: "/api/integrations/better-auth/events", timestamp: 1788307260000, nonce: "ffeeddccbbaa99887766554433221100", body: '{"protocolVersion":1,"pluginVersion":"0.1.0","provider":"better-auth","projectId":"j57abc","eventId":"5f0c3a2e-1b4d-4c6e-9a8f-7d6e5c4b3a21","type":"user.created","subject":"9b1c0d2e3f4a5b6c7d8e9f0a1b2c3d4e","occurredAt":"2026-09-01T08:01:00.000Z"}' },
  { name: "empty body", method: "REQUEST", path: "/usertrack/metrics", timestamp: 1788307300000, nonce: "00000000000000000000000000000001", body: "" },
  { name: "native event push", method: "REQUEST", path: "/api/integrations/native/events", timestamp: 1788307320000, nonce: "0123456789abcdef0123456789abcdef", body: '{"protocolVersion":1,"clientVersion":"0.1.0","source":"prisma","projectId":"j57abc","eventId":"7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","type":"user.activated","subject":"1a2b3c4d5e6f708192a3b4c5d6e7f809","occurredAt":"2026-09-01T08:02:00.000Z"}' },
  { name: "multi-role metrics response", method: "RESPONSE", path: "/usertrack/metrics", timestamp: 1788307400000, nonce: "fedcba9876543210fedcba9876543210", body: '{"protocolVersion":1,"clientVersion":"0.1.0","source":"drizzle","projectId":"j57abc","generatedAt":"2026-09-01T08:03:20.000Z","users":{"totalUsers":10,"newUsers":{"24h":1,"7d":2,"30d":3}},"activation":{"activatedUsers":4},"conversion":{"convertedUsers":2,"trialUsers":1,"mode":"active_paid"},"capabilities":{"exactCounts":true,"history":true,"roles":["users","activation","conversion"]}}' },
];
const out = { secret, cases: cases.map((c) => {
  const bodyHash = createHash("sha256").update(c.body).digest("hex");
  const canonical = ["v1", c.method, c.path, String(c.timestamp), c.nonce, bodyHash].join("\n");
  const signature = "v1=" + createHmac("sha256", secret).update(canonical).digest("hex");
  return { ...c, bodyHash, canonical, signature };
}) };
writeFileSync(new URL("./signatures.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("wrote", out.cases.length, "fixtures");
