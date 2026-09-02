import { OgFrame, OgEyebrow, OgChip, ogImage, ogWordmark, OG_SIZE, PINK, MUTED } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "UserTrack — the user lifecycle data layer for SaaS";

// Data-free fallback for every route without its own card (auth, app, 404): it can never fail to render.
export default async function Image() {
  const stages = ["Reached", "Signed up", "Activated", "Trial", "Converted"];
  return ogImage(
    <OgFrame wordmark={await ogWordmark()} chips={<OgChip tone="pink">Free · No revenue data</OgChip>} footerRight="Public API · MCP · Embeds">
      <OgEyebrow>The user lifecycle data layer</OgEyebrow>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 14, fontSize: 70, fontWeight: 700, letterSpacing: -3, lineHeight: 1.04 }}>
        <div style={{ display: "flex" }}>Track how users discover,</div>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ display: "flex" }}>activate and</div>
          <div style={{ display: "flex", color: PINK }}>convert</div>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 18, fontSize: 26, color: MUTED, maxWidth: 800 }}>
        Connect read-only sources once. UserTrack builds the funnel, ranks the growth and never asks for revenue.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 40 }}>
        {stages.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <OgChip tone={i === stages.length - 1 ? "pink" : "ghost"}>{s}</OgChip>
            {i < stages.length - 1 && <div style={{ display: "flex", width: 18, height: 2, background: "rgba(255,255,255,0.25)" }} />}
          </div>
        ))}
      </div>
    </OgFrame>,
  );
}
