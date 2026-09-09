// Handoff from the landing hero through /preview into the onboarding wizard. sessionStorage only: the preview is
// never shared or indexed, and it is a prefill, not a fact — a stale, foreign or malformed payload is dropped
// rather than trusted (same pattern as ut:onboarding-mode / ut:onboarding-stack).
export const PREVIEW_DRAFT_KEY = "ut:preview-draft";
const VERSION = 1;
const MAX_AGE_MS = 60 * 60_000;

export interface PreviewDraft {
  url: string;
  // Set once /preview has actually read the site; a draft without it is just the address the visitor typed.
  ready?: boolean;
  name?: string;
  description?: string;
  valueProposition?: string;
  logoUrl?: string;
  // Set only by the signed-in importer, which copies the icon into Convex storage. Deliberately absent from
  // STRING_KEYS: a storage id must never arrive from sessionStorage, only from the action that just created it.
  logoStorageId?: string;
  category?: string;
  projectType?: "hybrid";
  appStoreUrl?: string;
  playStoreUrl?: string;
  identity?: string;
  analytics?: string;
  monetization?: string;
}

const STRING_KEYS = ["url", "name", "description", "valueProposition", "logoUrl", "category", "appStoreUrl", "playStoreUrl", "identity", "analytics", "monetization"] as const;

export function writePreviewDraft(draft: PreviewDraft) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PREVIEW_DRAFT_KEY, JSON.stringify({ ...draft, v: VERSION, at: Date.now() }));
}

export function clearPreviewDraft() {
  if (typeof window !== "undefined") sessionStorage.removeItem(PREVIEW_DRAFT_KEY);
}

export function readPreviewDraft(now = Date.now()): PreviewDraft | null {
  if (typeof window === "undefined") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(sessionStorage.getItem(PREVIEW_DRAFT_KEY) ?? "null");
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== VERSION || typeof row.at !== "number" || !Number.isFinite(row.at) || now - row.at > MAX_AGE_MS) return null;
  const out: Record<string, string> = {};
  for (const k of STRING_KEYS) if (typeof row[k] === "string" && row[k]) out[k] = row[k] as string;
  if (!out.url) return null;
  return { ...out, url: out.url, ready: row.ready === true, projectType: row.projectType === "hybrid" ? "hybrid" : undefined };
}
