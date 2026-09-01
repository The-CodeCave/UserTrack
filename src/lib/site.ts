export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const saasUrl = (slug: string) => `${SITE_URL}/s/${slug}`;
export const profileUrl = (username: string) => `${SITE_URL}/u/${username}`;
