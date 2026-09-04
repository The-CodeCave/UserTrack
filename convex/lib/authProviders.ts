// Social sign-in providers for Better Auth. A provider is only registered when its credentials exist, so a deployment
// without GitHub or X keys keeps Google / email working and the UI disables the missing buttons.
import { followersOf, X_ME_URL, type XMe } from "./xApi";

type Env = Record<string, string | undefined>;

export const SOCIAL_PROVIDERS = ["google", "github", "twitter"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

const ENV_KEYS: Record<SocialProvider, [string, string]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  // Same X app as "Connect X" (convex/social.ts); only the callback /api/auth/callback/twitter has to be added to it.
  twitter: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
};

const credentials = (env: Env, p: SocialProvider) => {
  const [clientId, clientSecret] = ENV_KEYS[p].map((k) => env[k]);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export const enabledProviders = (env: Env) => Object.fromEntries(SOCIAL_PROVIDERS.map((p) => [p, credentials(env, p) !== null])) as Record<SocialProvider, boolean>;

export function socialProviderConfig(env: Env) {
  const google = credentials(env, "google");
  const github = credentials(env, "github");
  const twitter = credentials(env, "twitter");
  return {
    ...(google && { google }),
    ...(github && { github }),
    ...(twitter && { twitter: { ...twitter, getUserInfo: xUserInfo } }),
  };
}

const xAvatar = (url?: string) => url?.replace("_normal", "_400x400");

// Better Auth 1.6's X provider falls back to the username when X shares no email, which would create users whose
// "email" is a handle. Returning null makes the callback fail with `email_not_found`, which the sign-in page explains.
export async function xUserInfo(token: { accessToken?: string }, fetchFn: typeof fetch = fetch) {
  const headers = { Authorization: `Bearer ${token.accessToken}` };
  const res = await fetchFn(X_ME_URL, { headers });
  if (!res.ok) return null;
  const { data } = (await res.json()) as XMe;
  if (!data?.id) return null;
  // Separate request: X rejects the whole call when the app lacks the email permission.
  const emailRes = await fetchFn("https://api.x.com/2/users/me?user.fields=confirmed_email", { headers });
  const email = emailRes.ok ? ((await emailRes.json()) as { data?: { confirmed_email?: string } }).data?.confirmed_email : undefined;
  return { user: { id: data.id, name: data.name || data.username, email: email ?? null, image: xAvatar(data.profile_image_url), emailVerified: Boolean(email) }, data };
}

export type ProviderHandle = { github?: string; x?: string; avatarUrl?: string; xFollowers?: number };

// Handle + avatar of a freshly linked account, fetched once with the provider token (the token itself stays in Better Auth).
export async function fetchProviderHandle(providerId: "github" | "twitter", accessToken: string, fetchFn: typeof fetch = fetch): Promise<ProviderHandle | null> {
  const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": "UserTrack" };
  if (providerId === "github") {
    const res = await fetchFn("https://api.github.com/user", { headers: { ...headers, Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const me = (await res.json()) as { login?: string; avatar_url?: string };
    return me.login ? { github: me.login, avatarUrl: me.avatar_url } : null;
  }
  const res = await fetchFn(X_ME_URL, { headers });
  if (!res.ok) return null;
  const me = (await res.json()) as XMe;
  return me.data?.username ? { x: me.data.username, avatarUrl: xAvatar(me.data.profile_image_url), xFollowers: followersOf(me) } : null;
}
