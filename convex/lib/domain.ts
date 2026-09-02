// Canonical domains so "https://www.example.com/", "example.com" and "WWW.EXAMPLE.COM" resolve to one project.

export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  let host: string;
  try {
    host = new URL(withProto).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.+$/, "").replace(/^www\./, "");
  if (!host || !host.includes(".") || /[^a-z0-9.-]/.test(host)) return null;
  return host;
}

// Website URL as stored on a project: https + canonical host, path preserved (without trailing slash).
export function canonicalWebsiteUrl(input: string): string | null {
  const host = normalizeDomain(input);
  if (!host) return null;
  const raw = input.trim();
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let path = "";
  try {
    path = new URL(withProto).pathname.replace(/\/+$/, "");
  } catch {
    path = "";
  }
  return `https://${host}${path === "/" ? "" : path}`;
}

export const sameDomain = (a: string, b: string) => {
  const x = normalizeDomain(a);
  return x !== null && x === normalizeDomain(b);
};
