import { EMPTY_STATS, publicData, publicQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { OgFrame, OgEyebrow, OgChip, OgCheck, OgArrowUp, OgLogo, ogImage, ogWordmark, remoteImage, truncate, OG_SIZE, PINK, MUTED, DIM, LINE } from "@/lib/og/frame";
import { formatCompact } from "@/lib/format";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "UserTrack is live — see which SaaS is gaining users right now";
export const revalidate = 300;

// Cache buster v2026-09-13-launch: Next hashes this file into the og:image ?query, so bump this line to force a refetch.

export default async function Image() {
  const data = await publicData(() => Promise.all([publicQuery(api.public.stats, {}), publicQuery(api.public.leaderboard, { verifiedOnly: false, limit: 3 })]));
  const [stats, top] = data ?? [EMPTY_STATS, []];
  const logos = await Promise.all(top.map((s) => remoteImage(s.logoUrl)));

  return ogImage(
    <OgFrame
      wordmark={await ogWordmark()}
      chips={
        <>
          <OgChip>Free</OgChip>
          <OgChip tone="pink" icon={<div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: PINK }} />}>Now live</OgChip>
        </>
      }
      footerRight="Add your SaaS — free"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <OgEyebrow>Public SaaS growth leaderboard</OgEyebrow>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 16, fontSize: 60, fontWeight: 700, letterSpacing: -2.6, lineHeight: 1.04 }}>
            <div style={{ display: "flex" }}>Which SaaS is</div>
            <div style={{ display: "flex" }}>gaining users</div>
            <div style={{ display: "flex", color: PINK }}>right now?</div>
          </div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 25, color: MUTED, lineHeight: 1.35 }}>
            Verified user growth, read-only from Clerk, Supabase, Stripe & co. Never any revenue.
          </div>
          {stats.trackedUsers > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, fontSize: 22, color: MUTED }}>
            <OgCheck />
            <div style={{ display: "flex", color: PINK, fontWeight: 700 }}>{formatCompact(stats.trackedUsers)}</div>
            <div style={{ display: "flex" }}>users tracked · synced every 4 hours</div>
          </div>
          )}
        </div>

        {top.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", width: 400, border: `1.5px solid ${LINE}`, background: "rgba(10,11,13,0.72)" }}>
            <div style={{ display: "flex", padding: "14px 20px", borderBottom: `1px solid ${LINE}`, fontFamily: "Geist Mono", fontSize: 15, letterSpacing: 2.4, color: DIM }}>
              TOP · NEW USERS 30D
            </div>
            {top.map((s, i) => (
              <div key={s._id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderTop: i ? `1px solid ${LINE}` : "none" }}>
                <div style={{ display: "flex", width: 30, fontFamily: "Geist Mono", fontSize: 22, color: i === 0 ? PINK : DIM }}>{`#${i + 1}`}</div>
                <OgLogo name={s.name} src={logos[i]} size={48} radius={10} />
                <div style={{ display: "flex", flex: 1, fontSize: 26, fontWeight: 700, letterSpacing: -0.6 }}>{truncate(s.name, 14)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 24, fontWeight: 700, color: PINK }}>
                  <OgArrowUp />
                  {`+${formatCompact(s.newUsers30d)}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </OgFrame>,
  );
}
