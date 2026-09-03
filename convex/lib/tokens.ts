// Developer credentials: secret format, hashing, scopes and plan limits. Pure and runtime-agnostic (Convex + Node).

export type TokenType = "api" | "mcp";

export const PREFIX: Record<TokenType, string> = { api: "ut_api_", mcp: "ut_mcp_" };

export const SCOPES = [
  { key: "projects:read", label: "Read projects", description: "List and inspect your SaaS projects, integration state and verification." },
  { key: "projects:write", label: "Create & update projects", description: "Create projects, edit metadata, publish. Never deletes." },
  { key: "integrations:read", label: "Read integrations", description: "Supported providers and setup instructions." },
  { key: "integrations:write", label: "Configure integrations", description: "Connect data sources, verify connections, trigger syncs." },
  { key: "metrics:read", label: "Read metrics", description: "Growth metrics, history, ranks, milestones and share URLs." },
  { key: "profile:read", label: "Read profile", description: "Your founder profile and account summary." },
  { key: "profile:write", label: "Update profile", description: "Edit your founder profile (name, bio, links, X handle) and create share cards from your events." },
  { key: "follows:read", label: "Read your watchlist", description: "Products and founders you follow, with their movement and the personal feed." },
  { key: "follows:write", label: "Follow / unfollow products and founders", description: "Add or remove products and founders on your watchlist." },
  { key: "webhooks:read", label: "List webhook endpoints and deliveries", description: "Your webhook endpoints (secrets masked), the event catalog and the delivery log." },
  { key: "webhooks:write", label: "Create, update, test and rotate webhook endpoints", description: "Manage webhook endpoints; new secrets are returned once." },
] as const;

export type Scope = (typeof SCOPES)[number]["key"];
export const SCOPE_KEYS = new Set<string>(SCOPES.map((s) => s.key));
export const DEFAULT_MCP_SCOPES: Scope[] = ["projects:read", "projects:write", "integrations:read", "integrations:write", "metrics:read", "profile:read", "profile:write", "follows:read", "follows:write", "webhooks:read", "webhooks:write"];
export const API_SCOPES: Scope[] = ["metrics:read"];

// Free plan. Structured so limits can later differ per plan without touching call sites.
export const PLANS = {
  free: {
    api: { perDay: 1_000, burstPerMinute: 120 },
    mcp: { perDay: 5_000, burstPerMinute: 60, createProjectPerHour: 10, verifyCooldownSec: 20, syncCooldownSec: 60 },
    anonymous: { burstPerMinute: 60 },
  },
} as const;
export type Plan = keyof typeof PLANS;
export const planFor = (): Plan => "free";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// 40 random base62 chars ≈ 238 bits of entropy.
export function generateSecret(type: TokenType, random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(40);
  let body = "";
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  const secret = `${PREFIX[type]}${body}`;
  return { secret, prefix: displayPrefix(secret) };
}

// First 4 chars after the type prefix, e.g. "ut_api_a8f3". Stored for identification only.
export function displayPrefix(secret: string) {
  return secret.slice(0, 7 + 4);
}

export function maskToken(prefix: string) {
  return `${prefix}••••••••••••`;
}

export function tokenTypeOf(secret: string): TokenType | null {
  if (secret.startsWith(PREFIX.api)) return "api";
  if (secret.startsWith(PREFIX.mcp)) return "mcp";
  return null;
}

export function looksLikeSecret(secret: string) {
  return tokenTypeOf(secret) !== null && /^[A-Za-z0-9_]{40,}$/.test(secret) && secret.length <= 80;
}

export function hasScope(scopes: readonly string[], required?: string) {
  return !required || scopes.includes(required);
}

export function validScopes(scopes: readonly string[]) {
  return scopes.every((s) => SCOPE_KEYS.has(s));
}

export function isActive(t: { revokedAt?: number; expiresAt?: number }, now = Date.now()) {
  if (t.revokedAt !== undefined) return false;
  if (t.expiresAt !== undefined && t.expiresAt <= now) return false;
  return true;
}

// Synchronous SHA-256 (FIPS 180-4) so hashing is deterministic inside Convex mutations and identical in Node.
export function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = bytes.length;
  const padded = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, (len * 8) >>> 0);
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000));
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}
