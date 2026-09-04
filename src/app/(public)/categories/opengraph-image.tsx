import { publicQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { OgFrame, OgEyebrow, ogImage, ogWordmark, OG_SIZE, LINE, PINK, MUTED, DIM, HOST } from "@/lib/og/frame";
import { CATEGORIES } from "@/lib/categories";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "SaaS growth leaderboards by category";
export const revalidate = 300;

export default async function Image() {
  const stats = await publicQuery(api.public.stats, {});
  const counts = new Map(stats.categories.map((c) => [c.slug, c.count]));

  return ogImage(
    <OgFrame wordmark={await ogWordmark()} footerLeft={`${HOST}/categories`} footerRight={`${stats.saasCount} products · ${CATEGORIES.length} categories`}>
      <OgEyebrow>Categories</OgEyebrow>
      <div style={{ display: "flex", fontSize: 60, fontWeight: 700, letterSpacing: -2.6, lineHeight: 1.04, marginTop: 12 }}>Growth leaderboards by category</div>
      <div style={{ display: "flex", fontSize: 25, color: MUTED, marginTop: 10 }}>Every category has its own trending, fastest-growing and most-users board.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30, maxWidth: 1080 }}>
        {[...CATEGORIES].sort((a, b) => (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0)).map((c) => {
          const n = counts.get(c.slug) ?? 0;
          return (
            <div key={c.slug} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", border: `1px solid ${n ? "rgba(251,1,132,0.45)" : LINE}`, background: n ? "rgba(251,1,132,0.08)" : "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", fontSize: 25, fontWeight: 600, letterSpacing: -0.4, color: n ? "#fafafa" : DIM }}>{c.label}</div>
              <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 19, color: n ? PINK : DIM }}>{n}</div>
            </div>
          );
        })}
      </div>
    </OgFrame>,
  );
}
