import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { OgFrame, OgEyebrow, OgLogo, OgStat, OgSpark, ogImage, ogWordmark, remoteImage, truncate, OG_SIZE, LINE, MUTED, DIM, INK, HOST } from "@/lib/og/frame";
import { formatCompact, formatDelta } from "@/lib/format";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Founder profile on UserTrack";
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await fetchQuery(api.public.profileByUsername, { username });
  const projects = p?.saas.slice(0, 3) ?? [];
  const [avatar, ...logos] = await Promise.all([remoteImage(p?.avatarUrl), ...projects.map((s) => remoteImage(s.logoUrl))]);
  const name = truncate(p?.displayName ?? "Not found", 20);
  const total = p ? p.saas.reduce((a, s) => a + s.totalUsers, 0) : 0;
  const new30 = p ? p.saas.reduce((a, s) => a + s.newUsers30d, 0) : 0;

  return ogImage(
    <OgFrame wordmark={await ogWordmark()} footerLeft={`${HOST}/u/${username}`} footerRight={`${p?.followerCount ?? 0} followers`}>
      <OgEyebrow>Founder</OgEyebrow>
      <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 16 }}>
        <OgLogo name={name} src={avatar} size={96} radius={48} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", fontSize: name.length > 13 ? 48 : 58, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{name}</div>
          <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 21, color: MUTED, letterSpacing: 1 }}>@{truncate(username, 24)}</div>
        </div>
        <div style={{ display: "flex", marginLeft: "auto", gap: 38 }}>
          <OgStat label="Products" value={String(p?.saas.length ?? 0)} size={46} />
          <OgStat label="Users" value={formatCompact(total)} accent size={46} />
          <OgStat label="New · 30d" value={formatDelta(new30)} size={46} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
        {projects.map((s, i) => (
          <div key={s.slug} style={{ display: "flex", alignItems: "center", gap: 18, height: 62, borderTop: `1px solid ${LINE}` }}>
            <OgLogo name={s.name} src={logos[i]} size={38} radius={9} />
            <div style={{ display: "flex", fontSize: 28, fontWeight: 600, letterSpacing: -0.6 }}>{truncate(s.name, 26)}</div>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 16, color: DIM, letterSpacing: 1.4 }}>{formatCompact(s.totalUsers).toUpperCase()} USERS</div>
            <div style={{ display: "flex", marginLeft: "auto", alignItems: "center", gap: 22 }}>
              <OgSpark values={s.spark} width={130} height={32} color="rgba(255,255,255,0.45)" />
              <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: -0.8, color: INK, width: 150, justifyContent: "flex-end" }}>{formatDelta(s.newUsers30d)}</div>
            </div>
          </div>
        ))}
        {p && p.saas.length > 3 && <div style={{ display: "flex", marginTop: 14, fontFamily: "Geist Mono", fontSize: 18, color: DIM, letterSpacing: 1.6 }}>+{p.saas.length - 3} MORE PRODUCTS</div>}
        {projects.length === 0 && <div style={{ display: "flex", borderTop: `1px solid ${LINE}`, paddingTop: 26, fontSize: 26, color: MUTED }}>No public products yet.</div>}
      </div>
    </OgFrame>,
  );
}
