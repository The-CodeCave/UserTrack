import { EMPTY_STATS, publicData, publicQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { OgFrame, OgChart, OgEyebrow, OgChip, OgStat, OgCheck, ogImage, ogWordmark, OG_SIZE, PINK, MUTED } from "@/lib/og/frame";
import { formatCompact } from "@/lib/format";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "UserTrack — SaaS user growth, ranked";
export const revalidate = 300;

// Default card for the whole public site; every board / detail page overrides it with its own.
export default async function Image() {
  const data = await publicData(() => Promise.all([publicQuery(api.public.stats, {}), publicQuery(api.public.leaderboard, { verifiedOnly: false, limit: 1 })]));
  const [stats, top] = data ?? [EMPTY_STATS, []];

  return ogImage(
    <OgFrame
      wordmark={await ogWordmark()}
      chips={
        <>
          <OgChip>Free</OgChip>
          <OgChip tone="pink" icon={<OgCheck />}>Verified data</OgChip>
        </>
      }
      chart={<OgChart values={top[0]?.spark ?? []} height={158} />}
      footerRight="API · MCP · Embeds"
    >
      <OgEyebrow>Public SaaS growth leaderboard</OgEyebrow>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 14, fontSize: 60, fontWeight: 700, letterSpacing: -2.6, lineHeight: 1.04 }}>
        <div style={{ display: "flex" }}>Which SaaS is gaining users</div>
        <div style={{ display: "flex", color: PINK }}>right now?</div>
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: 26, color: MUTED }}>Read-only sources, synced every 4 hours. Never any revenue data.</div>
      <div style={{ display: "flex", gap: 56, marginTop: 30 }}>
        <OgStat label="Users tracked" value={formatCompact(stats.trackedUsers)} accent size={52} />
        <OgStat label="Products listed" value={String(stats.saasCount)} size={52} />
        <OgStat label="Verified" value={String(stats.verifiedCount)} size={52} />
      </div>
    </OgFrame>,
  );
}
