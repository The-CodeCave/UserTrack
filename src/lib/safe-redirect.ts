// Only same-origin absolute paths survive; anything that could resolve off-site falls back. Shared by Next.js and Convex.
const LEADING = /^\/(?![/\\])/;
const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;

export function safeInternalPath(raw: string | null | undefined, fallback = "/app") {
  if (!raw) return fallback;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return fallback; }
  if (!LEADING.test(raw) || !LEADING.test(decoded)) return fallback;
  if (CONTROL_OR_BACKSLASH.test(decoded)) return fallback;
  if (/^[^/?#]*[:@]/.test(decoded.slice(1))) return fallback;
  try { if (new URL(raw, "http://x.invalid").host !== "x.invalid") return fallback; } catch { return fallback; }
  return raw;
}
