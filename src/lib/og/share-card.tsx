import { publicQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { OgFrame, OgRangeChart, OgEyebrow, OgLogo, OgBadge, OgChip, OgCheck, cardTheme, ogImage, ogWordmark, remoteImage, truncate, MUTED, DIM, INK, HOST } from "@/lib/og/frame";
import { parseShareKind, shareCopy, SHARE_SIZES, GRAPH_KINDS, type ShareEvent, type ShareKind, type ShareSaas, type ShareWindow } from "@/lib/share";
import { CARD_RANGE_LABEL, DEFAULT_CARD, verificationLine, type CardConfig, type CardRange } from "@/lib/share-card";
import { formatCompact, formatDelta } from "@/lib/format";

export async function loadShare(slug: string, kindRaw: string) {
  const parsed = parseShareKind(kindRaw);
  if (!parsed) return null;
  if (parsed.milestoneId) {
    const r = await publicQuery(api.public.milestone, { slug, id: parsed.milestoneId });
    return r ? { s: r.saas, m: r.milestone as ShareEvent, kind: parsed.kind } : null;
  }
  if (parsed.eventId) {
    const r = await publicQuery(api.public.event, { slug, id: parsed.eventId });
    return r ? { s: r.saas, m: { ...r.event, eyebrow: "GROWTH SPIKE" } as ShareEvent, kind: parsed.kind } : null;
  }
  const s = await publicQuery(api.public.saasBySlug, { slug });
  if (!s) return null;
  if (parsed.kind === "benchmark") {
    // Only the public top-quarter statement exists; without one there is no benchmark card.
    const b = await publicQuery(api.public.benchmarkHighlight, { slug });
    if (!b) return null;
    return { s, m: { title: b.statement.replace(/^Top /, "Top "), copy: `Compared with ${formatCompact(b.sampleSize)} verified products on UserTrack · refreshed daily`, kind: "benchmark", achievedAt: Date.now(), eyebrow: "BENCHMARK" } as ShareEvent, kind: parsed.kind };
  }
  return { s, m: null, kind: parsed.kind };
}

// Copy window for the users / growth cards: 7 days is stored on the row, longer ranges come from the series the chart draws.
export async function shareWindow(slug: string, d: { s: ShareSaas; m: ShareEvent | null; kind: ShareKind }, range: CardRange): Promise<ShareWindow | undefined> {
  if (d.m || (d.kind !== "users" && d.kind !== "growth") || range === "30d") return undefined;
  if (range === "7d") return { range, newUsers: d.s.newUsers7d, growthPct: d.s.growth7dPct };
  const pts = await publicQuery(api.public.series, { slug, range }).catch(() => null);
  if (!pts || pts.length < 2) return undefined;
  const first = pts[0].total, last = pts[pts.length - 1].total;
  return { range, newUsers: last - first, growthPct: first > 0 ? ((last - first) / first) * 100 : undefined };
}

// Series for the card's chart: totals for the selected range; falls back to the 30-day sparkline.
async function chartSeries(slug: string, range: CardConfig["range"], spark: number[]) {
  const r = range === "30d" ? null : await publicQuery(api.public.series, { slug, range }).catch(() => null);
  const pts = r ?? null;
  if (pts && pts.length >= 2) return { values: pts.map((p) => p.total), dates: [pts[0].t, pts[pts.length - 1].t] as [number, number] };
  const values = spark;
  return { values, dates: values.length >= 2 ? ([Date.now() - (values.length - 1) * 86_400_000, Date.now()] as [number, number]) : undefined };
}

// One renderer for the share page's opengraph-image and its downloadable /card PNG (1200×630 or 1080×1080).
export async function renderShareCard(slug: string, kind: string, cfg: CardConfig = DEFAULT_CARD) {
  const d = await loadShare(slug, kind);
  const base = d?.s ? await publicQuery(api.public.saasBySlug, { slug }) : null;
  const c = d && base ? shareCopy(base, d.kind, d.m, await shareWindow(slug, d, cfg.range)) : { eyebrow: "USERTRACK", value: "Not found", sub: "" };
  const logo = cfg.logo ? await remoteImage(base?.logoUrl) : null;
  const square = cfg.size === "square";
  const t = cardTheme(cfg.style, cfg.accent);
  const dim = SHARE_SIZES[cfg.size];
  const showChart = Boolean(base) && cfg.chart && (GRAPH_KINDS.has(d?.kind ?? "") || !d?.m);
  const series = base && showChart ? await chartSeries(slug, cfg.range, base.spark) : null;
  const short = c.value.length <= 9;
  const value = square ? (short ? 210 : 78) : short ? 168 : 66;
  const eyebrow = cfg.title ?? c.eyebrow;
  const founder = cfg.founder && base?.owner?.x ? `@${base.owner.x}` : cfg.founder && base?.owner ? `by ${base.owner.displayName}` : null;
  const verified = base?.trust === "verified";
  const footerRight = cfg.verified && base ? verificationLine(base.trust) : base?.rank ? `#${base.rank} on the leaderboard` : "User growth";

  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      {cfg.logo && <OgLogo name={base?.name ?? "?"} src={logo} size={square ? 82 : 62} radius={14} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", fontSize: square ? 46 : 38, fontWeight: 600, letterSpacing: -1.2, color: INK }}>{truncate(base?.name ?? "Not found", 26)}</div>
        {(square || founder) && <div style={{ display: "flex", fontSize: square ? 25 : 20, color: t.onColor ? "rgba(255,255,255,0.82)" : MUTED, fontFamily: founder ? "Geist Mono" : "Geist" }}>{founder ?? truncate(base?.description ?? "", 52)}</div>}
      </div>
    </div>
  );

  return ogImage(
    <OgFrame
      wordmark={await ogWordmark()}
      square={square}
      style={cfg.style}
      accent={cfg.accent}
      chips={base ? (cfg.verified && verified ? <OgChip tone={t.onColor ? "solid" : "pink"} color={t.base} icon={<OgCheck color={t.onColor ? "#0a0b0d" : t.base} />}>Verified</OgChip> : <OgBadge trust={base.trust} />) : null}
      top={square ? head : undefined}
      chartFloat
      chart={series ? <OgRangeChart values={series.values} dates={cfg.dates ? series.dates : undefined} width={dim.width} height={square ? 400 : 268} fade fadeOpacity={t.fadeOpacity} fillOpacity={t.fillOpacity} labels={cfg.dates} labelColor={t.label} color={t.chart} /> : null}
      footerLeft={`${HOST}/s/${slug}`}
      footerRight={footerRight}
    >
      {!square && head}
      <div style={{ display: "flex", marginTop: square ? 0 : 30 }}>
        <OgEyebrow color={t.eyebrow}>{eyebrow}</OgEyebrow>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 6,
          fontSize: value,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: short ? -8 : -2.4,
          color: t.value,
          maxWidth: square ? 940 : 1060,
        }}
      >
        {truncate(c.value, 46)}
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: square ? 34 : 30, color: t.onColor ? "rgba(255,255,255,0.86)" : MUTED, maxWidth: square ? 930 : 1000 }}>{truncate(c.sub, 84)}</div>
      {cfg.dates && d && GRAPH_KINDS.has(d.kind) && !series && (
        <div style={{ display: "flex", marginTop: 10, fontFamily: "Geist Mono", fontSize: 17, letterSpacing: 1.6, color: t.onColor ? "rgba(255,255,255,0.7)" : DIM }}>{CARD_RANGE_LABEL[cfg.range].toUpperCase()}</div>
      )}
    </OgFrame>,
    dim,
  );
}

// Founder card: aggregate across public projects. /u/<username>/card[?style=…&size=square&range=…]
export async function renderFounderCard(username: string, cfg: CardConfig = DEFAULT_CARD) {
  const p = await publicQuery(api.public.profileByUsername, { username });
  const square = cfg.size === "square";
  const t = cardTheme(cfg.style, cfg.accent);
  const dim = SHARE_SIZES[cfg.size];
  const h = p && cfg.chart ? await publicQuery(api.public.founderHistory, { username, range: cfg.range === "7d" ? "7d" : cfg.range }) : null;
  const projects = p?.saas.slice(0, square ? 3 : 4) ?? [];
  const [avatar, ...logos] = await Promise.all([remoteImage(p?.avatarUrl), ...projects.map((s) => (cfg.logo ? remoteImage(s.logoUrl) : Promise.resolve(null)))]);
  const a = p?.aggregates;
  const name = truncate(p?.displayName ?? "Not found", 22);
  const points = h?.points ?? [];
  const verifiedAll = Boolean(a && a.verifiedCount > 0 && a.verifiedCount === a.projectCount);
  const footerRight = cfg.verified && p ? (verifiedAll ? "Verified by UserTrack" : "Tracked on UserTrack") : `${p?.followerCount ?? 0} followers`;

  return ogImage(
    <OgFrame
      wordmark={await ogWordmark()}
      square={square}
      style={cfg.style}
      accent={cfg.accent}
      chartFloat
      chart={points.length >= 2 ? <OgRangeChart values={points.map((x) => x.total)} dates={cfg.dates ? [points[0].t, points[points.length - 1].t] : undefined} width={dim.width} height={square ? 380 : 250} fade fadeOpacity={t.fadeOpacity} fillOpacity={t.fillOpacity} labels={cfg.dates} labelColor={t.label} color={t.chart} /> : null}
      footerLeft={`${HOST}/u/${username}`}
      footerRight={footerRight}
      chips={cfg.founder && p?.x ? <OgChip color={t.base}>{`@${p.x}${p.xFollowers !== undefined ? ` · ${formatCompact(p.xFollowers)} followers` : ""}`}</OgChip> : null}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <OgLogo name={name} src={avatar} size={square ? 110 : 92} radius={square ? 55 : 46} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 18, letterSpacing: 3, color: t.eyebrow }}>{(cfg.title ?? "FOUNDER").toUpperCase()}</div>
          <div style={{ display: "flex", fontSize: square ? 60 : name.length > 14 ? 50 : 60, fontWeight: 700, letterSpacing: -2, lineHeight: 1.02 }}>{name}</div>
          <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 21, color: t.onColor ? "rgba(255,255,255,0.86)" : MUTED, letterSpacing: 1 }}>@{truncate(username, 24)}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: square ? 46 : 56, marginTop: square ? 44 : 36 }}>
        <Stat label="Users" value={formatCompact(a?.totalUsers ?? 0)} color={t.value} labelColor={t.label} size={square ? 84 : 72} />
        <Stat label="New · 30 days" value={formatDelta(a?.newUsers30d ?? 0)} labelColor={t.label} size={square ? 84 : 72} />
        <Stat label={a?.projectCount === 1 ? "Product" : "Products"} value={String(a?.projectCount ?? 0)} labelColor={t.label} size={square ? 84 : 72} />
      </div>
      {projects.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: square ? 40 : 30 }}>
          {projects.map((s, i) => (
            <div key={s.slug} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 8px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.25)" }}>
              <OgLogo name={s.name} src={logos[i]} size={30} radius={7} />
              <div style={{ display: "flex", fontSize: 21, fontWeight: 600, letterSpacing: -0.4 }}>{truncate(s.name, 16)}</div>
              <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 15, color: t.label }}>{formatCompact(s.totalUsers)}</div>
            </div>
          ))}
          {p && p.saas.length > projects.length && <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 17, color: t.label, letterSpacing: 1.4 }}>+{p.saas.length - projects.length} MORE</div>}
        </div>
      )}
    </OgFrame>,
    dim,
  );
}

function Stat({ label, value, color = INK, labelColor = DIM, size }: { label: string; value: string; color?: string; labelColor?: string; size: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 17, letterSpacing: 2.4, color: labelColor }}>{label.toUpperCase()}</div>
      <div style={{ display: "flex", fontSize: size, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.6, color }}>{value}</div>
    </div>
  );
}
