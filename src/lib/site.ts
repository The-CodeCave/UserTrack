export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const SITE_HOST = (() => { try { return new URL(SITE_URL).host; } catch { return "usertrack"; } })();
export const saasUrl = (slug: string) => `${SITE_URL}/s/${slug}`;
export const profileUrl = (username: string) => `${SITE_URL}/u/${username}`;
export const badgeUrl = (slug: string, type = "users") => `${SITE_URL}/api/badge/${slug}.svg?type=${type}`;
export const shareUrl = (slug: string, kind: string) => `${SITE_URL}/s/${slug}/share/${kind}`;
