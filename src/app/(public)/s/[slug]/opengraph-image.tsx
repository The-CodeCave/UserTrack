import { publicQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { OgFrame, OgChart, OgEyebrow, OgLogo, OgStat, OgChip, OgBadge, OgArrowUp, ogImage, ogWordmark, remoteImage, truncate, OG_SIZE, MUTED, HOST } from "@/lib/og/frame";
import { formatCompact, formatDelta, formatPct, formatRate, timeAgo } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "SaaS growth on UserTrack";
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await publicQuery(api.public.saasBySlug, { slug });
  const wordmark = await ogWordmark();
  if (!s) {
    return ogImage(
      <OgFrame wordmark={wordmark} footerLeft={`${HOST}/s/${slug}`}>
        <OgEyebrow>Not found</OgEyebrow>
        <div style={{ display: "flex", fontSize: 62, fontWeight: 700, letterSpacing: -2.6, marginTop: 12 }}>This product is not on UserTrack</div>
        <div style={{ display: "flex", fontSize: 26, color: MUTED, marginTop: 12 }}>Connect a read-only source and claim the page in a few minutes.</div>
      </OgFrame>,
    );
  }
  const logo = await remoteImage(s.logoUrl);
  const name = truncate(s.name, 24);

  return ogImage(
    <OgFrame
      wordmark={wordmark}
      chips={
        <>
          {s.trendingRank ? <OgChip icon={<OgArrowUp />}>{`#${s.trendingRank} trending`}</OgChip> : null}
          {s.rank ? <OgChip>{`#${s.rank} leaderboard`}</OgChip> : null}
          <OgBadge trust={s.trust} />
        </>
      }
      chart={<OgChart values={s.spark} />}
      footerLeft={`${HOST}/s/${slug}`}
      footerRight={`${categoryLabel(s.category)} · synced ${s.lastSyncedAt ? timeAgo(s.lastSyncedAt) : "never"}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <OgLogo name={name} src={logo} size={104} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <div style={{ display: "flex", fontSize: name.length > 16 ? 62 : 74, fontWeight: 700, letterSpacing: -2.6, lineHeight: 1 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 26, color: MUTED, lineHeight: 1.3 }}>{truncate(s.description, 72)}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 64, marginTop: 44 }}>
        <OgStat label="Total users" value={formatCompact(s.totalUsers)} accent size={76} />
        <OgStat label="New · 30 days" value={formatDelta(s.newUsers30d)} size={76} />
        <OgStat label="Growth · 30d" value={formatPct(s.growth30dPct)} size={76} />
        {s.activationRatePct !== undefined && <OgStat label="Activation" value={formatRate(s.activationRatePct)} size={76} />}
      </div>
    </OgFrame>,
  );
}
