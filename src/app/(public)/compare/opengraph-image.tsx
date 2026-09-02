import { OgFrame, OgEyebrow, OgChip, OgSpark, ogImage, ogWordmark, OG_SIZE, LINE, MUTED, DIM, HOST } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Compare SaaS user growth side by side";

const COLORS = ["#fb0184", "#f4f4f5", "#7dd3fc", "#fbbf24"];
const CURVES = [
  [4, 9, 14, 22, 31, 44, 62, 88],
  [10, 14, 17, 23, 28, 33, 41, 52],
  [22, 24, 27, 29, 34, 36, 41, 45],
  [8, 16, 15, 21, 26, 25, 33, 38],
];

// Static card: the /compare page with slugs gets the live /compare/og image instead.
export default async function Image() {
  return ogImage(
    <OgFrame wordmark={await ogWordmark()} chips={<OgChip>Up to 4 products</OgChip>} footerLeft={`${HOST}/compare`} footerRight="7d · 30d · 90d · 1y · all">
      <OgEyebrow>Compare</OgEyebrow>
      <div style={{ display: "flex", fontSize: 62, fontWeight: 700, letterSpacing: -2.8, lineHeight: 1.04, marginTop: 12 }}>Compare SaaS growth side by side</div>
      <div style={{ display: "flex", fontSize: 25, color: MUTED, marginTop: 10, maxWidth: 900 }}>
        Total or indexed user curves, activation and trending scores for up to four products — with a shareable permalink.
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
        {COLORS.map((c, i) => (
          <div key={c} style={{ display: "flex", flexDirection: "column", flex: 1, padding: 20, border: `1px solid ${LINE}`, borderTop: `4px solid ${c}`, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 17, letterSpacing: 1.8, color: c }}>{`PRODUCT ${String.fromCharCode(65 + i)}`}</div>
            <div style={{ display: "flex", marginTop: 10 }}>
              <OgSpark values={CURVES[i]} width={220} height={78} color={c} />
            </div>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 16, color: DIM, marginTop: 8 }}>USERS · INDEXED</div>
          </div>
        ))}
      </div>
    </OgFrame>,
  );
}
