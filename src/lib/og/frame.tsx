import type { ReactElement, ReactNode } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og/fonts";
import { SITE_HOST } from "@/lib/site";

export const OG_SIZE = { width: 1200, height: 630 };

export const PINK = "#fb0184";
export const INK = "#fafafa";
export const MUTED = "#9aa0ab";
export const DIM = "#666b75";
export const BG = "#0a0b0d";
export const LINE = "rgba(255,255,255,0.13)";
export const LINE_SOFT = "rgba(255,255,255,0.09)";
export const HOST = SITE_HOST.replace(/^www\./, "");

let wordmarkCache: Promise<string> | null = null;
export function ogWordmark() {
  wordmarkCache ??= readFile(path.join(process.cwd(), "public", "brand", "wordmark.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`);
  return wordmarkCache;
}

// User-supplied logos are inlined (not handed to satori as a URL) so a slow or broken host can never fail the card.
export async function remoteImage(url?: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), headers: { "user-agent": "UserTrackOG/1.0" } });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !["image/png", "image/jpeg", "image/jpg", "image/gif", "image/svg+xml"].includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > 2_000_000 ? null : `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function ogImage(node: ReactElement, size = OG_SIZE, maxAge = 300) {
  return new ImageResponse(node, {
    ...size,
    fonts: await ogFonts(),
    headers: { "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=86400` },
  });
}

interface FrameProps {
  wordmark: string;
  children: ReactNode;
  chips?: ReactNode;
  /** Rendered directly under the header, outside the centered body. */
  top?: ReactNode;
  chart?: ReactNode;
  footerLeft?: string;
  footerRight?: string;
  square?: boolean;
  align?: "center" | "flex-end";
  /** Render the chart as a full-bleed layer behind the content instead of a band under it. */
  chartFloat?: boolean;
}

export function OgFrame({ wordmark, children, chips, top, chart, footerLeft, footerRight, square, align = "center", chartFloat }: FrameProps) {
  const pad = square ? 72 : 60;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BG, color: INK, fontFamily: "Geist", position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: `linear-gradient(${LINE_SOFT} 1px, transparent 1px), linear-gradient(90deg, ${LINE_SOFT} 1px, transparent 1px)`, backgroundSize: "48px 48px" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: "radial-gradient(760px 620px at 14% 72%, rgba(251,1,132,0.30), transparent 66%)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: "radial-gradient(760px 420px at 98% -14%, rgba(255,255,255,0.11), transparent 68%)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: "radial-gradient(520px 300px at 88% 118%, rgba(251,1,132,0.22), transparent 70%)" }} />
      {chartFloat && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: square ? 88 : 76, display: "flex" }}>{chart}</div>
      )}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, display: "flex", backgroundImage: `linear-gradient(90deg, ${PINK}, rgba(251,1,132,0.22) 52%, rgba(251,1,132,0) 88%)` }} />

      <div style={{ display: "flex", alignItems: "center", padding: `${pad - 16}px ${pad}px 0` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wordmark} alt="" width={132} height={47} style={{ width: 132, height: 47 }} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>{chips}</div>
      </div>

      {top && <div style={{ display: "flex", flexDirection: "column", padding: `28px ${pad}px 0` }}>{top}</div>}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: align, padding: `0 ${pad}px`, minHeight: 0 }}>{children}</div>

      {!chartFloat && chart}

      <div style={{ display: "flex", alignItems: "center", height: square ? 88 : 76, padding: `0 ${pad}px`, borderTop: `1px solid ${LINE}`, fontFamily: "Geist Mono", fontSize: square ? 19 : 17, letterSpacing: 1.6, color: DIM }}>
        <div style={{ display: "flex", color: MUTED }}>{(footerLeft ?? HOST).toUpperCase()}</div>
        {footerRight && <div style={{ display: "flex", marginLeft: "auto" }}>{footerRight.toUpperCase()}</div>}
      </div>
    </div>
  );
}

export function OgEyebrow({ children, color = PINK }: { children: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "Geist Mono", fontSize: 19, letterSpacing: 3.2, color }}>
      <div style={{ display: "flex", width: 26, height: 2, background: color }} />
      {children.toUpperCase()}
    </div>
  );
}

export function OgChip({ children, tone = "ghost", icon }: { children: string; tone?: "ghost" | "pink" | "solid"; icon?: ReactNode }) {
  const pink = tone === "pink";
  const solid = tone === "solid";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "9px 15px",
        border: `1.5px solid ${pink ? PINK : solid ? "transparent" : LINE}`,
        background: pink ? "rgba(251,1,132,0.14)" : solid ? INK : "rgba(255,255,255,0.03)",
        color: pink ? PINK : solid ? BG : MUTED,
        fontFamily: "Geist Mono",
        fontSize: 17,
        letterSpacing: 2,
        gap: 8,
      }}
    >
      {icon}
      {children.toUpperCase()}
    </div>
  );
}

export const OgCheck = ({ color = PINK, size = 15 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M2.5 8.5l3.5 3.5 7.5-8" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const OgArrowUp = ({ color = PINK, size = 13 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12"><path d="M6 0l6 11H0z" fill={color} /></svg>
);

export const OgBadge = ({ trust }: { trust: "verified" | "unverified" | "pending" }) => (
  <OgChip tone={trust === "verified" ? "pink" : "ghost"} icon={trust === "verified" ? <OgCheck /> : undefined}>
    {trust === "verified" ? "Verified" : trust === "pending" ? "Under review" : "Self-reported"}
  </OgChip>
);

export function OgStat({ label, value, accent, size = 66 }: { label: string; value: string; accent?: boolean; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 17, letterSpacing: 2.4, color: DIM }}>{label.toUpperCase()}</div>
      <div style={{ display: "flex", fontSize: size, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2.4, color: accent ? PINK : INK }}>{value}</div>
    </div>
  );
}

export function OgLogo({ name, src, size = 96, radius = 20 }: { name: string; src?: string | null; size?: number; radius?: number }) {
  const box = { width: size, height: size, borderRadius: radius, display: "flex" as const, flexShrink: 0 };
  if (src) {
    return (
      <div style={{ ...box, overflow: "hidden", border: `1px solid ${LINE}`, background: "#111318" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div style={{ ...box, alignItems: "center", justifyContent: "center", border: `1px solid ${LINE}`, background: "linear-gradient(150deg, rgba(251,1,132,0.28), rgba(255,255,255,0.04))", fontSize: size * 0.36, fontWeight: 700, letterSpacing: -1 }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// Full-bleed data floor: the series drawn edge to edge under the content, with a glow, gradient fill and end marker.
export function OgChart({ values, width = OG_SIZE.width, height = 176, color = PINK, fade }: { values: number[]; width?: number; height?: number; color?: string; fade?: boolean }) {
  const pts = values.length >= 2 ? values : null;
  if (!pts) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const top = 26;
  const usable = height - top - 10;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * (width - 16), top + usable - ((v - min) / span) * usable] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  const area = `${line} L${width} ${ly.toFixed(1)} L${width} ${height} L0 ${height} Z`;
  return (
    <div style={{ display: "flex", width, height, marginTop: "auto" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="ogFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.42" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="ogStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="ogFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={BG} stopOpacity="0.97" />
            <stop offset="34%" stopColor={BG} stopOpacity="0.86" />
            <stop offset="66%" stopColor={BG} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ogFill)" />
        <path d={line} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line} fill="none" stroke="url(#ogStroke)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lx} cy={ly} r="13" fill={color} fillOpacity="0.28" />
        <circle cx={lx} cy={ly} r="6.5" fill={color} stroke={BG} strokeWidth="3" />
        <path d={`M0 0H${width}V${height}H0Z`} fill={fade ? "url(#ogFade)" : "none"} />
      </svg>
    </div>
  );
}

// Compact per-row series used in board / leaderboard cards.
export function OgSpark({ values, width = 140, height = 40, color = PINK }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <div style={{ display: "flex", width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xy = values.map((v, i) => [(i / (values.length - 1)) * (width - 6) + 3, height - 4 - ((v - min) / span) * (height - 10)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={`${line} L${xy[xy.length - 1][0]} ${height} L${xy[0][0]} ${height} Z`} fill={color} fillOpacity="0.14" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
