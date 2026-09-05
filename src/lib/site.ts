export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const SITE_HOST = (() => { try { return new URL(SITE_URL).host; } catch { return "usertrack"; } })();
export const saasUrl = (slug: string) => `${SITE_URL}/s/${slug}`;
export const profileUrl = (username: string) => `${SITE_URL}/u/${username}`;
export const badgeUrl = (slug: string, type = "users") => `${SITE_URL}/api/badge/${slug}.svg?type=${type}`;
export const shareUrl = (slug: string, kind: string) => `${SITE_URL}/s/${slug}/share/${kind}`;

// Outbound links carry `ref` (for the app) + `utm_*` (Rybbit parses them natively); canonical / OG URLs stay clean.
export function attributedUrl(url: string, a: { ref: string; source: string; medium: string; campaign: string }) {
  const hashAt = url.indexOf("#");
  const base = hashAt === -1 ? url : url.slice(0, hashAt), hash = hashAt === -1 ? "" : url.slice(hashAt);
  const q = new URLSearchParams({ ref: a.ref, utm_source: a.source, utm_medium: a.medium, utm_campaign: a.campaign }).toString();
  return `${base}${base.includes("?") ? "&" : "?"}${q}${hash}`;
}
// Share page link for one outbound channel (x, link, mcp, x-founder, x-bot …); `shareUrl` itself stays the canonical.
export const shareLinkUrl = (slug: string, kind: string, channel: string) => attributedUrl(shareUrl(slug, kind), { ref: "share", source: channel, medium: "share-card", campaign: kind });
