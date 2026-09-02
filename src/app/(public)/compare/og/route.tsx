import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { OgFrame, OgEyebrow, OgSpark, OgLogo, ogImage, ogWordmark, remoteImage, truncate, LINE, MUTED, DIM, HOST } from "@/lib/og/frame";
import { formatCompact, formatDelta, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mirrors COMPARE_COLORS in compare-chart.tsx (a "use client" module, so its exports are not readable from a route handler).
const COLORS = ["#fb0184", "#f4f4f5", "#7dd3fc", "#fbbf24"];
type Days = 7 | 30 | 90 | 365 | 0;
const LABEL: Record<Days, string> = { 7: "last 7 days", 30: "last 30 days", 90: "last 90 days", 365: "last year", 0: "all history" };
const parseDays = (d: string | null): Days => (d === "all" ? 0 : (([7, 30, 90, 365] as const).find((x) => String(x) === d) ?? 30));
const growth = (series: { total: number }[]) => (series.length >= 2 && series[0].total > 0 ? formatPct((series[series.length - 1].total / series[0].total - 1) * 100) : "—");

// OG image for /compare?s=a,b&days=… — Next's opengraph-image files don't receive search params, so this is a plain route.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const slugs = (q.get("s") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4);
  const days = parseDays(q.get("days"));
  const items = slugs.length ? await fetchQuery(api.public.compare, { slugs, days }) : [];
  const logos = await Promise.all(items.map((s) => remoteImage(s.logoUrl)));
  const wide = items.length <= 2;
  const names = items.map((i) => truncate(i.name, wide ? 22 : items.length === 3 ? 13 : 10));

  return ogImage(
    <OgFrame
      wordmark={await ogWordmark()}
      footerLeft={`${HOST}/compare`}
      footerRight={`${items.length} products · ${LABEL[days]}`}
    >
      <OgEyebrow>{`Compare · ${LABEL[days]}`}</OgEyebrow>
      <div style={{ display: "flex", fontSize: names.join(" vs ").length > 34 ? 48 : 58, fontWeight: 700, letterSpacing: -2.2, lineHeight: 1.05, marginTop: 12, maxWidth: 1080 }}>
        {names.length ? names.join("  vs  ") : "Compare SaaS growth side by side"}
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
        {items.map((s, i) => (
          <div key={s.slug} style={{ display: "flex", flexDirection: "column", flex: 1, padding: 22, border: `1px solid ${LINE}`, borderTop: `4px solid ${COLORS[i]}`, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <OgLogo name={s.name} src={logos[i]} size={34} radius={8} />
              <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 17, letterSpacing: 1.6, color: COLORS[i] }}>{names[i].toUpperCase()}</div>
            </div>
            <div style={{ display: "flex", fontSize: wide ? 62 : 46, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1, marginTop: 14 }}>{formatCompact(s.totalUsers)}</div>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 18, color: MUTED, marginTop: 4 }}>
              USERS · {growth(s.series)}
            </div>
            <div style={{ display: "flex", marginTop: 14 }}>
              <OgSpark values={s.series.map((p) => p.total)} width={wide ? 420 : 200} height={72} color={COLORS[i]} />
            </div>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 17, color: DIM, marginTop: 8 }}>{formatDelta(s.newUsers30d)} · 30D</div>
          </div>
        ))}
        {items.length === 0 && <div style={{ display: "flex", fontSize: 26, color: MUTED }}>Pick up to four products to compare their user growth.</div>}
      </div>
    </OgFrame>,
  );
}
