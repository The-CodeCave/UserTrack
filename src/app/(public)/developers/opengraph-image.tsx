import { OgFrame, OgEyebrow, OgChip, ogImage, ogWordmark, OG_SIZE, LINE, PINK, INK, MUTED, DIM, HOST } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "UserTrack public API and MCP for developers";

const LINES: [string, string][] = [
  ["curl", `${HOST.toLowerCase()}/api/v1/saas/acme/metrics`],
  ["claude mcp add --transport http usertrack", `${HOST.toLowerCase()}/mcp`],
];

export default async function Image() {
  return ogImage(
    <OgFrame
      wordmark={await ogWordmark()}
      chips={
        <>
          <OgChip>OpenAPI 3.1</OgChip>
          <OgChip tone="pink">Free</OgChip>
        </>
      }
      footerLeft={`${HOST}/developers`}
      footerRight="60 req/min anonymous · 1,000/day with a key"
    >
      <OgEyebrow>Public API · MCP</OgEyebrow>
      <div style={{ display: "flex", fontSize: 62, fontWeight: 700, letterSpacing: -2.8, lineHeight: 1.04, marginTop: 12 }}>The growth data layer, as an API</div>
      <div style={{ display: "flex", fontSize: 25, color: MUTED, marginTop: 10, maxWidth: 880 }}>
        Read metrics, history, funnels and leaderboards as JSON — or let your AI agent add your SaaS through MCP in 60 seconds.
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 28, border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.03)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderBottom: `1px solid ${LINE}` }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ display: "flex", width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.55 }} />
          ))}
          <div style={{ display: "flex", marginLeft: 10, fontFamily: "Geist Mono", fontSize: 16, color: DIM, letterSpacing: 1.6 }}>TERMINAL</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 24px", fontFamily: "Geist Mono", fontSize: 22 }}>
          {LINES.map(([cmd, arg]) => (
            <div key={cmd} style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", color: PINK }}>$</div>
              <div style={{ display: "flex", color: INK }}>{cmd}</div>
              <div style={{ display: "flex", color: MUTED }}>{arg}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        {["REST JSON", "MCP tools", "SVG badges", "Share cards", "No key needed"].map((c) => (
          <OgChip key={c}>{c}</OgChip>
        ))}
      </div>
    </OgFrame>,
  );
}
