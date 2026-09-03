// Verification samples and payload examples shared by the dashboard dialog and the public docs page. Pure strings, no React.
import { SIGNATURE_TOLERANCE_SEC, WEBHOOK_API_VERSION } from "@convex/lib/webhooks";

export const nodeVerifySnippet = (secret = "process.env.USERTRACK_WEBHOOK_SECRET") => `import { createHmac, timingSafeEqual } from "node:crypto";

// Express: app.post("/hooks", express.raw({ type: "application/json" }), handler)
export function verifyUserTrack(rawBody: Buffer | string, headers: Record<string, string | undefined>) {
  const secret = ${secret};
  const timestamp = headers["usertrack-timestamp"] ?? "";
  const signature = headers["usertrack-signature"] ?? "";
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > ${SIGNATURE_TOLERANCE_SEC}) return false; // 5-minute tolerance
  const expected = "v1=" + createHmac("sha256", secret).update(\`\${timestamp}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}`;

export const PYTHON_VERIFY_SNIPPET = `import hmac, hashlib, time

def verify_usertrack(raw_body: bytes, headers: dict, secret: str) -> bool:
    timestamp = headers.get("UserTrack-Timestamp", "")
    signature = headers.get("UserTrack-Signature", "")
    if abs(time.time() - float(timestamp or 0)) > ${SIGNATURE_TOLERANCE_SEC}:
        return False
    expected = "v1=" + hmac.new(secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)`;

const PROJECT = `"project": { "id": "j57…", "slug": "acme", "name": "Acme", "url": "https://usertrack.dev/s/acme", "totalUsers": 10000 }`;

export const PAYLOAD_EXAMPLE = `{
  "id": "evt_milestone_reached_j57…_users_10000",
  "type": "milestone.reached",
  "apiVersion": "${WEBHOOK_API_VERSION}",
  "createdAt": "2026-09-02T08:00:00.000Z",
  "data": {
    ${PROJECT},
    "milestone": { "id": "m1…", "key": "users:10000", "kind": "users", "metric": "totalUsers", "value": 10000, "title": "10,000 users", "achievedAt": "2026-09-02T08:00:00.000Z" }
  }
}`;

// data.* shape per event type (the project ref is always present).
export const EVENT_DATA_EXAMPLES: Record<string, string> = {
  "milestone.reached": `"milestone": { "id": "m1…", "key": "users:10000", "kind": "users", "metric": "totalUsers", "value": 10000, "title": "10,000 users", "achievedAt": "…" }`,
  "rank.changed": `"rank": { "board": "leaderboard", "window": "30d", "from": 14, "to": 9, "best": 9 }`,
  "trending.rank_changed": `"rank": { "board": "trending", "window": "7d", "from": 22, "to": 6, "score": 81.4 }`,
  "growth.spike": `"spike": { "day": "2026-09-01", "newUsers": 412, "average": 96, "multiple": 4.3, "metric": "newUsers" }`,
  "integration.failed": `"integration": { "id": "i1…", "role": "users", "provider": "postgres", "label": "Postgres", "error": "connection refused", "consecutiveFailures": 6, "lastSuccessAt": "…" }`,
  "integration.recovered": `"integration": { "id": "i1…", "role": "users", "provider": "postgres", "label": "Postgres", "unhealthySince": "…", "downForMs": 86400000 }`,
  "project.verified": `"verification": { "level": "verified", "provider": "clerk", "verifiedAt": "…" }`,
  "webhook.test": `"message": "Test event from UserTrack…", "sample": { "type": "milestone.reached", "milestone": { "kind": "users", "metric": "totalUsers", "value": 10000, "title": "10,000 users" } }`,
};
