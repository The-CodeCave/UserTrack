import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { ogWordmark, OgFrame, OgSpark, OgBadge, OG_SIZE, PINK, MUTED } from "@/lib/og/frame";
import { ogFonts } from "@/lib/og/fonts";
import { formatCompact, formatDelta, formatPct } from "@/lib/format";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "SaaS growth on UserTrack";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  const name = s?.name ?? "Not found";
  const total = s ? formatCompact(s.totalUsers) : "—";
  const delta = s ? formatDelta(s.newUsers30d) : "";
  const pct = s ? formatPct(s.growth30dPct) : "";

  return new ImageResponse(
    (
      <OgFrame wordmark={await ogWordmark()} footer={s?.rank ? `#${s.rank} · LAST 30 DAYS` : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", fontSize: 56, letterSpacing: -1.5, lineHeight: 1.05 }}>{name}</div>
              {s && <OgBadge trust={s.trust} />}
            </div>
            <div style={{ display: "flex", marginTop: 12, fontSize: 24, color: MUTED, maxWidth: 640 }}>{s?.description ?? ""}</div>
            <div style={{ display: "flex", gap: 48, marginTop: 44 }}>
              <Stat label="TOTAL USERS" value={total} accent />
              <Stat label="NEW · 30D" value={delta} />
              <Stat label="GROWTH" value={pct} />
            </div>
          </div>
          <div style={{ display: "flex" }}>{s && <OgSpark values={s.spark} />}</div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 16, letterSpacing: 2, color: MUTED }}>{label}</div>
      <div style={{ display: "flex", fontSize: 64, lineHeight: 1.1, color: accent ? PINK : undefined, letterSpacing: -2 }}>{value}</div>
    </div>
  );
}
