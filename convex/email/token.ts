// Signed, expiring preference/unsubscribe tokens (HMAC-SHA256, WebCrypto). No login needed to open the link.

export interface PrefsTokenPayload {
  userId: string;
  scope: "prefs";
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signPrefsToken(secret: string, userId: string, ttlMs = 90 * 24 * 3_600_000, now = Date.now()) {
  const payload: PrefsTokenPayload = { userId, scope: "prefs", exp: now + ttlMs };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function verifyPrefsToken(secret: string, token: string, now = Date.now()): Promise<PrefsTokenPayload | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(await hmac(secret, body));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as PrefsTokenPayload;
    if (payload.scope !== "prefs" || typeof payload.userId !== "string" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
