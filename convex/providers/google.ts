import { ProviderError } from "./types";

// Google service-account auth (RS256 JWT → OAuth2 access token) using WebCrypto. Shared by Firebase and GA4.
export interface ServiceAccount { client_email: string; private_key: string; project_id?: string }

export function parseServiceAccount(raw: unknown): ServiceAccount {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error("Service account must be the JSON file contents");
    }
  }
  const sa = obj as Partial<ServiceAccount>;
  if (!sa?.client_email || !sa.private_key?.includes("PRIVATE KEY")) throw new Error("Service account JSON needs client_email and private_key");
  return { client_email: sa.client_email, private_key: sa.private_key, project_id: sa.project_id };
}

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToDer(pem: string) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function signServiceAccountJwt(sa: ServiceAccount, scope: string, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

export async function googleAccessToken(sa: ServiceAccount, scope: string) {
  const assertion = await signServiceAccountJwt(sa, scope);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new ProviderError(`Google auth failed: ${json.error_description ?? res.status}`, res.status >= 500);
  return json.access_token;
}
