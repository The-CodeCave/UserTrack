import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { ogWordmark, OgFrame, OgSpark, OgBadge, OG_SIZE, PINK, MUTED } from "@/lib/og/frame";
import { ogFonts } from "@/lib/og/fonts";
import { parseShareKind, shareCopy } from "@/lib/share";

// One renderer for the share page's opengraph-image and its downloadable /card PNG.
export async function renderShareCard(slug: string, kind: string) {
  const parsed = parseShareKind(kind);
  const base = await fetchQuery(api.public.saasBySlug, { slug });
  const m = parsed?.milestoneId ? (await fetchQuery(api.public.milestone, { slug, id: parsed.milestoneId }))?.milestone ?? null : null;
  const c = base && parsed ? shareCopy(base, parsed.kind, m) : { eyebrow: "USERTRACK", value: "Not found", sub: "" };
  const big = c.value.length <= 8;
  return new ImageResponse(
    (
      <OgFrame wordmark={await ogWordmark()} footer={c.eyebrow}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", fontSize: 40, letterSpacing: -1, color: MUTED }}>{base?.name ?? ""}</div>
              {base && <OgBadge trust={base.trust} />}
            </div>
            <div style={{ display: "flex", marginTop: 8, fontSize: big ? 150 : m ? 64 : 96, lineHeight: 1.05, letterSpacing: big ? -6 : -2, color: PINK, maxWidth: 760 }}>{c.value}</div>
            <div style={{ display: "flex", marginTop: 16, fontSize: 26, color: "#f4f4f5", maxWidth: 720 }}>{c.sub}</div>
          </div>
          <div style={{ display: "flex" }}>{base && <OgSpark values={base.spark} width={340} height={130} />}</div>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
