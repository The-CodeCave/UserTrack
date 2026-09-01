import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { OgFrame, OG_SIZE, PINK, MUTED } from "@/lib/og/frame";
import { ogFonts } from "@/lib/og/fonts";
import { formatCompact, formatDelta } from "@/lib/format";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "UserTrack leaderboard";

export default async function Image() {
  const rows = await fetchQuery(api.public.leaderboard, { verifiedOnly: true, limit: 5 });
  const text = `${rows.map((r) => `${r.name}${formatCompact(r.totalUsers)}${formatDelta(r.newUsers30d)}`).join("")}Who is gaining users right now SaaS ranked by verified new users · last 30 days USERTRACK.APP UserTrack #0123456789.,+−%KM`;
  return new ImageResponse(
    (
      <OgFrame footer="LEADERBOARD · 30D">
        <div style={{ display: "flex", fontSize: 52, letterSpacing: -1.5 }}>Who is gaining users right now</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 22, color: MUTED }}>SaaS ranked by verified new users · last 30 days</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, borderTop: "1px solid rgba(255,255,255,0.16)" }}>
          {rows.map((r, i) => (
            <div key={r._id} style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.16)", fontSize: 26 }}>
              <div style={{ display: "flex", width: 48, fontFamily: "Geist Mono", color: i < 3 ? PINK : MUTED }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ display: "flex", flex: 1 }}>{r.name}</div>
              <div style={{ display: "flex", width: 180, fontFamily: "Geist Mono", color: MUTED }}>{formatCompact(r.totalUsers)}</div>
              <div style={{ display: "flex", width: 140, justifyContent: "flex-end", color: PINK }}>{formatDelta(r.newUsers30d)}</div>
            </div>
          ))}
          {rows.length === 0 && <div style={{ display: "flex", padding: "16px 0", color: MUTED, fontSize: 24 }}>Be the first on the board.</div>}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts(text) },
  );
}
