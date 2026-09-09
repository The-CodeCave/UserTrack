import type { SitePreview } from "@convex/enrich";
import type { PreviewDraft } from "@/lib/preview-draft";

export type PreviewOutcome = { preview: SitePreview } | { error: string; reason: string };

// The public read of a visitor's own site: /api/preview owns the per-IP limit and answers one JSON envelope
// either way, so both callers (the landing dialog and /preview) branch on the same shape.
export async function readSitePreview(url: string): Promise<PreviewOutcome> {
  try {
    const res = await fetch("/api/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const body = (await res.json().catch(() => null)) as (SitePreview & { message?: string; code?: string }) | null;
    if (!res.ok || !body) return { error: body?.message ?? "Could not read that website", reason: body?.code ?? String(res.status) };
    return { preview: body };
  } catch {
    return { error: "Could not reach UserTrack — check your connection and try again.", reason: "network" };
  }
}

export const draftOf = (p: SitePreview): PreviewDraft => ({
  url: p.url, ready: true, name: p.name, description: p.description, valueProposition: p.valueProposition, logoUrl: p.logoUrl,
  category: p.hints.category, projectType: p.hints.projectType, appStoreUrl: p.hints.appStoreUrl, playStoreUrl: p.hints.playStoreUrl,
  identity: p.hints.identity, analytics: p.hints.analytics, monetization: p.hints.monetization,
});
