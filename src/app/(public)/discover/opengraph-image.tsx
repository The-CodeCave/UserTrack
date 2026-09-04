import { publicQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { OgFrame, OgEyebrow, OgChip, OgLogo, ogImage, ogWordmark, remoteImage, truncate, OG_SIZE, LINE, PINK, MUTED, DIM, HOST } from "@/lib/og/frame";
import { formatDelta } from "@/lib/format";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Discover SaaS that is actually growing";
export const revalidate = 300;

const SECTIONS = ["Trending now", "Fastest today", "New & rising", "Hidden gems", "Recently verified"];

export default async function Image() {
  const [stats, trending] = await Promise.all([publicQuery(api.public.stats, {}), publicQuery(api.public.board, { board: "trending", window: "7d", verifiedOnly: false, limit: 3 })]);
  const logos = await Promise.all(trending.map((s) => remoteImage(s.logoUrl)));

  return ogImage(
    <OgFrame wordmark={await ogWordmark()} chips={<OgChip tone="pink">{`${stats.saasCount} products`}</OgChip>} footerLeft={`${HOST}/discover`} footerRight="No editorial picks · computed from snapshots">
      <OgEyebrow>Discover</OgEyebrow>
      <div style={{ display: "flex", fontSize: 62, fontWeight: 700, letterSpacing: -2.8, lineHeight: 1.04, marginTop: 12 }}>Find SaaS that is actually growing</div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 26, padding: "18px 24px", border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.03)", maxWidth: 1080 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="10.5" cy="10.5" r="6.5" stroke={PINK} strokeWidth="2" />
          <path d="M15.5 15.5L21 21" stroke={PINK} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div style={{ display: "flex", fontSize: 25, color: DIM }}>Search by product, founder, category or tag…</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap", maxWidth: 1080 }}>
        {SECTIONS.map((s) => (
          <OgChip key={s}>{s}</OgChip>
        ))}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 26 }}>
        {trending.map((s, i) => (
          <div key={s.slug} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, padding: "16px 18px", border: `1px solid ${LINE}`, borderTop: `3px solid ${i === 0 ? PINK : "rgba(255,255,255,0.28)"}` }}>
            <OgLogo name={s.name} src={logos[i]} size={44} radius={10} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 600, letterSpacing: -0.6 }}>{truncate(s.name, 16)}</div>
              <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 17, color: MUTED }}>{formatDelta(s.newUsers7d)} · 7D</div>
            </div>
          </div>
        ))}
      </div>
    </OgFrame>,
  );
}
