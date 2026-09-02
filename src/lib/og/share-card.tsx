import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { ogWordmark, OgFrame, OgSpark, OgBadge, PINK, MUTED } from "@/lib/og/frame";
import { ogFonts } from "@/lib/og/fonts";
import { parseShareKind, shareCopy, SHARE_SIZES, type ShareEvent, type ShareSize } from "@/lib/share";

export async function loadShare(slug: string, kindRaw: string) {
  const parsed = parseShareKind(kindRaw);
  if (!parsed) return null;
  if (parsed.milestoneId) {
    const r = await fetchQuery(api.public.milestone, { slug, id: parsed.milestoneId });
    return r ? { s: r.saas, m: r.milestone as ShareEvent, kind: parsed.kind } : null;
  }
  if (parsed.eventId) {
    const r = await fetchQuery(api.public.event, { slug, id: parsed.eventId });
    return r ? { s: r.saas, m: { ...r.event, eyebrow: "GROWTH SPIKE" } as ShareEvent, kind: parsed.kind } : null;
  }
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  return s ? { s, m: null, kind: parsed.kind } : null;
}

// One renderer for the share page's opengraph-image and its downloadable /card PNG (1200×630 or 1080×1080).
export async function renderShareCard(slug: string, kind: string, size: ShareSize = "og") {
  const d = await loadShare(slug, kind);
  const base = d ? await fetchQuery(api.public.saasBySlug, { slug }) : null;
  const c = d && base ? shareCopy(base, d.kind, d.m) : { eyebrow: "USERTRACK", value: "Not found", sub: "" };
  const square = size === "square";
  const big = c.value.length <= 8;
  const valueSize = square ? (big ? 190 : d?.m ? 72 : 120) : big ? 150 : d?.m ? 64 : 96;
  return new ImageResponse(
    (
      <OgFrame wordmark={await ogWordmark()} footer={c.eyebrow}>
        <div style={{ display: "flex", flexDirection: square ? "column" : "row", justifyContent: "space-between", alignItems: square ? "flex-start" : "flex-end", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", fontSize: 40, letterSpacing: -1, color: MUTED, maxWidth: square ? 900 : 640, overflow: "hidden" }}>{base?.name ?? ""}</div>
              {base && <OgBadge trust={base.trust} />}
            </div>
            <div style={{ display: "flex", marginTop: 8, fontSize: valueSize, lineHeight: 1.05, letterSpacing: big ? -6 : -2, color: PINK, maxWidth: square ? 960 : 760 }}>{c.value}</div>
            <div style={{ display: "flex", marginTop: 16, fontSize: square ? 30 : 26, color: "#f4f4f5", maxWidth: square ? 960 : 720 }}>{c.sub}</div>
          </div>
          <div style={{ display: "flex" }}>{base && <OgSpark values={base.spark} width={square ? 960 : 340} height={square ? 220 : 130} />}</div>
        </div>
      </OgFrame>
    ),
    { ...SHARE_SIZES[size], fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
