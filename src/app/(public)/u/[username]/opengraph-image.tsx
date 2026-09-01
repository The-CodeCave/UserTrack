import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { OgFrame, OG_SIZE, PINK, MUTED } from "@/lib/og/frame";
import { ogFonts } from "@/lib/og/fonts";
import { formatCompact, formatDelta } from "@/lib/format";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Founder profile on UserTrack";

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await fetchQuery(api.public.profileByUsername, { username });
  const total = p ? formatCompact(p.saas.reduce((a, s) => a + s.totalUsers, 0)) : "—";
  const new30 = p ? formatDelta(p.saas.reduce((a, s) => a + s.newUsers30d, 0)) : "";
  const name = p?.displayName ?? "Not found";
  const names = p?.saas.slice(0, 4).map((s) => s.name).join("  ·  ") ?? "";

  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 112, height: 112, border: "1.5px solid rgba(255,255,255,0.4)", fontSize: 48, fontFamily: "Geist Mono" }}>{name.slice(0, 1).toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 56, letterSpacing: -1.5 }}>{name}</div>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 22, color: MUTED }}>@{username}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 48, marginTop: 40 }}>
          <Stat label="SAAS" value={String(p?.saas.length ?? 0)} />
          <Stat label="USERS" value={total} accent />
          <Stat label="NEW · 30D" value={new30} />
        </div>
        <div style={{ display: "flex", marginTop: 28, fontFamily: "Geist Mono", fontSize: 18, color: MUTED, letterSpacing: 1 }}>{names}</div>
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
