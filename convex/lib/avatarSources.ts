// Where a founder's profile picture can come from without asking them to upload one, and without a paid API.
// Pure builders and ordering only; the fetching lives in convex/enrich.ts.
//
// Every source is free and keyless. They are tried in the order below and the first image we can actually download
// wins. All three are called server-side, so the founder's own IP and user agent never reach them — only the public
// handle, or a hash of their email in Gravatar's case (docs/PRIVACY note in src/app/(public)/privacy).

export type AvatarSource = "x" | "github" | "gravatar";

export interface AvatarCandidate {
  source: AvatarSource;
  url: string;
}

// X does not serve avatars by handle without a paid plan, so the keyless route is unavatar's X endpoint.
// `fallback=false` makes an unknown handle a 404 instead of a generated placeholder we would happily store.
export const unavatarUrl = (handle: string) => `https://unavatar.io/x/${encodeURIComponent(handle)}?fallback=false`;

// X serves a 48px "_normal" crop by default; the 400px variant is the same file at a usable size.
export const xAvatarSize = (url: string) => url.replace("_normal", "_400x400");

// Unlimited and unauthenticated; 404s for unknown logins.
export const githubAvatarUrl = (login: string) => `https://github.com/${encodeURIComponent(login)}.png?size=400`;

// `d=404` means "no Gravatar for this address" instead of the default generated identicon.
export const gravatarUrl = (emailSha256: string) => `https://gravatar.com/avatar/${emailSha256}?s=400&d=404`;

// Gravatar hashes the trimmed, lowercased address.
export const gravatarKey = (email: string) => email.trim().toLowerCase();

export async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
