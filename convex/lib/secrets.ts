// Provider credentials are encrypted with AES-256-GCM before they reach the database and decrypted only where a
// provider call actually needs them (convex/providerRun.ts, the native HMAC check) — never in a query returned to a
// client. Structural config fields stay plaintext so publicConfig / describe / historyLimit keep working unchanged.
// Key: CONFIG_ENCRYPTION_KEY = base64 of 32 random bytes (`openssl rand -base64 32`).
import { normalizeProviderKind, type ProviderKind } from "../providers/types";

const PREFIX = "enc.v1.";
const IV_BYTES = 12;

// The one auditable list of credential fields. A provider missing here stores its config in the clear.
export const SECRET_FIELDS: Record<ProviderKind, readonly string[]> = {
  auth0: ["clientSecret"],
  chargebee: ["apiKey"],
  clerk: ["secretKey"],
  endpoint: ["token"],
  firebase: ["serviceAccount"],
  ga4: ["serviceAccount"],
  lemonsqueezy: ["apiKey"],
  manual: [],
  native: ["secret"],
  paddle: ["apiKey"],
  plausible: ["apiKey"],
  postgres: ["connectionString"],
  posthog: ["apiKey"],
  revenuecat: ["apiKey"],
  stripe: ["secretKey"],
  supabase: ["serviceKey", "connectionString"],
};

export const isEncrypted = (v: unknown): v is string => typeof v === "string" && v.startsWith(PREFIX);

async function key() {
  const raw = process.env.CONFIG_ENCRYPTION_KEY;
  if (!raw) throw new Error("CONFIG_ENCRYPTION_KEY is not set — provider credentials cannot be stored or read");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("CONFIG_ENCRYPTION_KEY must be the base64 of exactly 32 bytes");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export async function encryptValue(plain: string): Promise<string> {
  if (isEncrypted(plain)) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return PREFIX + toBase64(out);
}

// Values written before this feature (and inline configs that were never stored) are passed through untouched.
export async function decryptValue(stored: string): Promise<string> {
  if (!isEncrypted(stored)) return stored;
  const raw = Uint8Array.from(atob(stored.slice(PREFIX.length)), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, IV_BYTES) }, await key(), raw.subarray(IV_BYTES));
  return new TextDecoder().decode(plain);
}

async function mapSecrets<T>(kind: string, config: T, fn: (v: string) => Promise<string>): Promise<T> {
  const fields = SECRET_FIELDS[normalizeProviderKind(kind)] ?? [];
  if (!fields.length || !config || typeof config !== "object") return config;
  const out = { ...(config as Record<string, unknown>) };
  for (const f of fields) if (typeof out[f] === "string" && out[f]) out[f] = await fn(out[f] as string);
  return out as T;
}

export const encryptConfig = <T,>(kind: string, config: T) => mapSecrets(kind, config, encryptValue);
export const decryptConfig = <T,>(kind: string, config: T) => mapSecrets(kind, config, decryptValue);
