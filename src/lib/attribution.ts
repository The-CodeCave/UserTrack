// First-touch sign-up attribution (docs/ANALYTICS.md): ref / utm_* of the first visit, kept in localStorage until the
// profile is created. Client and Convex share the sanitizer so the stored shape is validated on both ends.
export const ATTRIBUTION_KEY = "ut:attribution";
export const ATTRIBUTION_MAX_AGE_MS = 30 * 86_400_000;
export interface Attribution { ref?: string; source?: string; medium?: string; campaign?: string; at: number }

const FIELDS = { ref: "ref", source: "utm_source", medium: "utm_medium", campaign: "utm_campaign" } as const;
type Field = keyof typeof FIELDS;

// Lowercase `[a-z0-9_-]`, at most 40 chars; anything else is dropped.
export function sanitizeParam(v: unknown) {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase().slice(0, 40);
  return /^[a-z0-9_-]+$/.test(s) ? s : undefined;
}

const pick = (get: (field: Field) => unknown, at: number): Attribution | null => {
  const out: Attribution = { at };
  for (const f of Object.keys(FIELDS) as Field[]) {
    const v = sanitizeParam(get(f));
    if (v) out[f] = v;
  }
  return Object.keys(out).length > 1 ? out : null;
};

export function parseAttribution(search: string, now = Date.now()) {
  const q = new URLSearchParams(search);
  return pick((f) => q.get(FIELDS[f]), now);
}

// Re-validates a stored / submitted record; null when nothing valid is left or it is older than 30 days.
export function sanitizeAttribution(raw: unknown, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.at !== "number" || !Number.isFinite(r.at) || now - r.at > ATTRIBUTION_MAX_AGE_MS) return null;
  return pick((f) => r[f], r.at);
}

// Browser: first touch wins — nothing is written while a record exists.
export function captureAttribution(search = window.location.search) {
  try {
    if (localStorage.getItem(ATTRIBUTION_KEY)) return;
    const a = parseAttribution(search);
    if (a) localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(a));
  } catch { /* storage blocked */ }
}

export function readAttribution() {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    return raw ? sanitizeAttribution(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
