import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { ogWordmark, OgFrame, OgSpark, OG_SIZE, MUTED } from "@/lib/og/frame";
import { ogFonts } from "@/lib/og/fonts";
import { formatCompact, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mirrors COMPARE_COLORS in compare-chart.tsx (a "use client" module, so its exports are not readable from a route handler).
const COLORS = ["#fb0184", "#f4f4f5", "#7dd3fc", "#fbbf24"];
type Days = 7 | 30 | 90 | 365 | 0;
const LABEL: Record<Days, string> = { 7: "LAST 7 DAYS", 30: "LAST 30 DAYS", 90: "LAST 90 DAYS", 365: "LAST YEAR", 0: "ALL HISTORY" };
const parseDays = (d: string | null): Days => (d === "all" ? 0 : (([7, 30, 90, 365] as const).find((x) => String(x) === d) ?? 30));
const trunc = (s: string) => (s.length > 24 ? `${s.slice(0, 23)}…` : s);
const growth = (series: { total: number }[]) => (series.length >= 2 && series[0].total > 0 ? formatPct((series[series.length - 1].total / series[0].total - 1) * 100) : "—");

// OG image for /compare?s=a,b&days=… — Next's opengraph-image files don't receive search params, so this is a plain route.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const slugs = (q.get("s") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4);
  const days = parseDays(q.get("days"));
  const items = slugs.length ? await fetchQuery(api.public.compare, { slugs, days }) : [];
  const names = items.map((i) => trunc(i.name));
  const title = items.length ? `UserTrack comparison: ${names.join(" vs ")}` : "UserTrack comparison";
  return new ImageResponse(
    (
      <OgFrame wordmark={await ogWordmark()} footer={`COMPARE · ${LABEL[days]}`}>
        <div style={{ display: "flex", fontSize: items.length > 2 ? 36 : 44, letterSpacing: -1, lineHeight: 1.1, maxWidth: 1080 }}>{title}</div>
        <div style={{ display: "flex", gap: 24, marginTop: 36 }}>
          {items.map((s, i) => (
            <div key={s.slug} style={{ display: "flex", flexDirection: "column", flex: 1, padding: 20, border: "1px solid rgba(255,255,255,0.16)", borderTop: `3px solid ${COLORS[i]}` }}>
              <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 16, letterSpacing: 2, color: COLORS[i] }}>{names[i].toUpperCase()}</div>
              <div style={{ display: "flex", fontSize: items.length > 2 ? 44 : 56, lineHeight: 1.1, letterSpacing: -2, marginTop: 8 }}>{formatCompact(s.totalUsers)}</div>
              <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 18, color: MUTED, marginTop: 4 }}>users · {growth(s.series)}</div>
              <div style={{ display: "flex", marginTop: 12 }}><OgSpark values={s.series.map((p) => p.total)} width={items.length > 2 ? 200 : 320} height={64} /></div>
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
