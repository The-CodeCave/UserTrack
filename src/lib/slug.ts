export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
export const RESERVED = new Set(["app", "api", "s", "u", "leaderboard", "sign-in", "sign-up", "admin", "usertrack"]);

export function isValidHandle(s: string) {
  return USERNAME_RE.test(s) && !RESERVED.has(s);
}
