import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { OgFrame, OgChart, OgEyebrow, OgLogo, OgBadge, ogImage, ogWordmark, remoteImage, truncate, PINK, MUTED, INK, HOST } from "@/lib/og/frame";
import { parseShareKind, shareCopy, SHARE_SIZES, type ShareEvent, type ShareSize } from "@/lib/share";

export async function loadShare(slug: string, kindRaw: string) {
  const parsed = parseShareKind(kindRaw);
  if (!parsed) return null;
  if (parsed.milestoneId) {
    const r = await fetchQuery(api.public.milestone, { slug, id: parsed.milestoneId });
    return r ? { s: r.saas, m: r.milestone as ShareEvent, kind: parsed.kind } : null;
  }
  if (parsed.eventId) {
    const r = await fetchQuery(api.public.event, { slug, id: parsed.eventId });
    return r ? { s: r.saas, m: { ...r.event, eyebrow: "GROWTH SPIKE" } as ShareEvent, kind: parsed.kind } : null;
  }
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  return s ? { s, m: null, kind: parsed.kind } : null;
}

// One renderer for the share page's opengraph-image and its downloadable /card PNG (1200×630 or 1080×1080).
export async function renderShareCard(slug: string, kind: string, size: ShareSize = "og") {
  const d = await loadShare(slug, kind);
  const base = d ? await fetchQuery(api.public.saasBySlug, { slug }) : null;
  const c = d && base ? shareCopy(base, d.kind, d.m) : { eyebrow: "USERTRACK", value: "Not found", sub: "" };
  const logo = await remoteImage(base?.logoUrl);
  const square = size === "square";
  const dim = SHARE_SIZES[size];
  const short = c.value.length <= 9;
  const value = square ? (short ? 210 : 78) : short ? 168 : 66;

  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <OgLogo name={base?.name ?? "?"} src={logo} size={square ? 82 : 62} radius={14} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", fontSize: square ? 46 : 38, fontWeight: 600, letterSpacing: -1.2, color: INK }}>{truncate(base?.name ?? "Not found", 26)}</div>
        {square && <div style={{ display: "flex", fontSize: 25, color: MUTED }}>{truncate(base?.description ?? "", 52)}</div>}
      </div>
    </div>
  );

  return ogImage(
    <OgFrame
      wordmark={await ogWordmark()}
      square={square}
      chips={base ? <OgBadge trust={base.trust} /> : null}
      top={square ? head : undefined}
      chartFloat
      chart={<OgChart values={base?.spark ?? []} width={dim.width} height={square ? 400 : 268} fade />}
      footerLeft={`${HOST}/s/${slug}`}
      footerRight={base?.rank ? `#${base.rank} on the leaderboard` : "Verified user growth"}
    >
      {!square && head}
      <div style={{ display: "flex", marginTop: square ? 0 : 30 }}>
        <OgEyebrow>{c.eyebrow}</OgEyebrow>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 6,
          fontSize: value,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: short ? -8 : -2.4,
          color: PINK,
          maxWidth: square ? 940 : 1060,
        }}
      >
        {truncate(c.value, 46)}
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: square ? 34 : 30, color: MUTED, maxWidth: square ? 930 : 1000 }}>{truncate(c.sub, 84)}</div>
    </OgFrame>,
    dim,
  );
}
