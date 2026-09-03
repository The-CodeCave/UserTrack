// X / Twitter handle rules shared by the profile form, Convex mutations, MCP and share cards. Pure, no I/O.

export const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

// "@ada", "ada", "https://x.com/ada/", "twitter.com/ada?s=20" → "ada". Never throws; validate with isValidXHandle.
export function normalizeXHandle(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/^@+/, "")
    .trim();
}

export const isValidXHandle = (h: string) => X_HANDLE_RE.test(h);

// undefined = fine (empty or valid); otherwise a message for the form.
export function xHandleError(raw: string | null | undefined): string | undefined {
  const h = normalizeXHandle(raw);
  if (!h) return undefined;
  if (h.length > 15) return "X handles are at most 15 characters";
  if (!isValidXHandle(h)) return "Only letters, numbers and underscores";
  return undefined;
}

export const displayXHandle = (h: string) => `@${normalizeXHandle(h)}`;
export const xProfileUrl = (h: string) => `https://x.com/${normalizeXHandle(h)}`;

export function xIntentUrl(text: string, url?: string) {
  const p = new URLSearchParams({ text });
  if (url) p.set("url", url);
  return `https://x.com/intent/post?${p.toString()}`;
}

// What the UI may claim about an X account. A typed handle is never presented as verified.
export type XConnectionState = "connected_via_oauth" | "handle_provided" | "unavailable";
export function xConnectionState(i: { handle?: string | null; connected?: boolean }): XConnectionState {
  if (i.connected) return "connected_via_oauth";
  return i.handle ? "handle_provided" : "unavailable";
}
export const X_STATE_LABEL: Record<XConnectionState, string> = { connected_via_oauth: "Connected", handle_provided: "Handle provided", unavailable: "Not set" };
