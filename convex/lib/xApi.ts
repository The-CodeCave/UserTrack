// X API v2 plumbing shared by the OAuth flow and the posting job. Pure builders here; the network calls live in
// convex/social.ts actions. Nothing in this file ever logs a token.
export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;
export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
export const X_ME_URL = "https://api.x.com/2/users/me?user.fields=profile_image_url,name,username";
export const X_TWEETS_URL = "https://api.x.com/2/tweets";
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

export const callbackPath = "/api/social/x/callback";
export const redirectUri = (siteUrl: string) => `${siteUrl.replace(/\/$/, "")}${callbackPath}`;

export function authorizeUrl(i: { clientId: string; siteUrl: string; state: string; codeChallenge: string }) {
  const p = new URLSearchParams({ response_type: "code", client_id: i.clientId, redirect_uri: redirectUri(i.siteUrl), scope: X_SCOPES.join(" "), state: i.state, code_challenge: i.codeChallenge, code_challenge_method: "S256" });
  return `${X_AUTHORIZE_URL}?${p.toString()}`;
}

export const basicAuth = (clientId: string, clientSecret: string) => `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

export function tokenRequestBody(i: { code: string; codeVerifier: string; clientId: string; siteUrl: string }) {
  return new URLSearchParams({ grant_type: "authorization_code", code: i.code, redirect_uri: redirectUri(i.siteUrl), code_verifier: i.codeVerifier, client_id: i.clientId });
}

export function refreshRequestBody(i: { refreshToken: string; clientId: string }) {
  return new URLSearchParams({ grant_type: "refresh_token", refresh_token: i.refreshToken, client_id: i.clientId });
}

export interface TokenResponse { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string }

export function parseTokenResponse(json: unknown): TokenResponse {
  const j = json as Record<string, unknown>;
  if (!j || typeof j.access_token !== "string") throw new Error("X did not return an access token");
  return { access_token: j.access_token, refresh_token: typeof j.refresh_token === "string" ? j.refresh_token : undefined, expires_in: typeof j.expires_in === "number" ? j.expires_in : undefined, scope: typeof j.scope === "string" ? j.scope : undefined };
}

// Human-readable, secret-free reason for a failed X call.
export function describeXError(status: number, body: string) {
  let detail = "";
  try {
    const j = JSON.parse(body) as { detail?: string; title?: string; error_description?: string; error?: string };
    detail = j.detail ?? j.error_description ?? j.title ?? j.error ?? "";
  } catch {
    detail = body.slice(0, 120);
  }
  if (status === 401) return `X rejected the credentials (401)${detail ? `: ${detail}` : ""}. Reconnect the account.`;
  if (status === 403) return `X refused the request (403)${detail ? `: ${detail}` : ""}. The app may lack write access.`;
  if (status === 429) return "X rate limit reached (429). The post was not retried.";
  return `X returned ${status}${detail ? `: ${detail}` : ""}`;
}

// The token is refreshed a minute before expiry so a post never races the deadline.
export const needsRefresh = (expiresAt: number | undefined, now: number) => expiresAt !== undefined && expiresAt - now < 60_000;

// ---- OAuth 1.0a (UserTrack-owned bot account) ----------------------------------------------------------------------
// The bot posts with long-lived user-context credentials (consumer key/secret + access token/secret), which never rotate,
// so nothing has to be persisted. JSON bodies are not part of the signature base (only form params would be).
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface OAuth1Creds { consumerKey: string; consumerSecret: string; accessToken: string; accessSecret: string }

export function oauth1BaseString(method: string, url: string, params: Record<string, string>) {
  const u = new URL(url);
  const all: Record<string, string> = { ...params };
  u.searchParams.forEach((v, k) => { all[k] = v; });
  const normalized = Object.keys(all).map((k) => [enc(k), enc(all[k])] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
  return `${method.toUpperCase()}&${enc(`${u.origin}${u.pathname}`)}&${enc(normalized)}`;
}

async function hmacSha1(key: string, data: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function oauth1Header(c: OAuth1Creds, method: string, url: string, formParams: Record<string, string> = {}, opts: { nonce?: string; timestamp?: number } = {}) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: c.consumerKey,
    oauth_nonce: opts.nonce ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(opts.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_token: c.accessToken,
    oauth_version: "1.0",
  };
  const base = oauth1BaseString(method, url, { ...formParams, ...oauth });
  const signature = await hmacSha1(`${enc(c.consumerSecret)}&${enc(c.accessSecret)}`, base);
  const header = Object.entries({ ...oauth, oauth_signature: signature }).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(", ");
  return `OAuth ${header}`;
}
