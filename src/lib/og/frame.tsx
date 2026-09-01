import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };
export const PINK = "#fb0184";
export const INK = "#f4f4f5";
export const MUTED = "#8b8f98";
export const BG = "#0b0c0e";
const LINE = "rgba(255,255,255,0.16)";
const HOST = (() => { try { return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://usertrack.app").hostname.toUpperCase(); } catch { return "USERTRACK.APP"; } })();

// Shared blueprint frame: graphite surface, construction grid, corner ticks, wordmark.
export function OgFrame({ children, footer }: { children: ReactNode; footer?: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BG,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        color: INK,
        fontFamily: "Geist, sans-serif",
        padding: 56,
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", inset: 28, border: `1px solid ${LINE}`, display: "flex" }} />
      {[
        { top: 24, left: 24, borderTop: "2px solid #fff", borderLeft: "2px solid #fff" },
        { top: 24, right: 24, borderTop: "2px solid #fff", borderRight: "2px solid #fff" },
        { bottom: 24, left: 24, borderBottom: "2px solid #fff", borderLeft: "2px solid #fff" },
        { bottom: 24, right: 24, borderBottom: "2px solid #fff", borderRight: "2px solid #fff" },
      ].map((s, i) => (
        <div key={i} style={{ position: "absolute", width: 14, height: 14, display: "flex", ...s }} />
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, border: "1.5px solid rgba(255,255,255,0.4)", fontFamily: "Geist Mono", fontSize: 16 }}>
          U<span style={{ color: PINK }}>T</span>
        </div>
        <div style={{ display: "flex", fontSize: 24 }}>User<span style={{ color: PINK }}>Track</span></div>
        <div style={{ marginLeft: "auto", display: "flex", fontFamily: "Geist Mono", fontSize: 16, color: MUTED, letterSpacing: 2 }}>{footer ?? HOST}</div>
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "flex-end" }}>{children}</div>
    </div>
  );
}

export function OgSpark({ values, width = 420, height = 140 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 8) + 4, height - 4 - ((v - min) / span) * (height - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]} ${height} L${pts[0][0]} ${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={area} fill={PINK} fillOpacity={0.14} />
      <path d={line} fill="none" stroke={INK} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={7} fill={PINK} stroke={BG} strokeWidth={3} />
    </svg>
  );
}

export function OgBadge({ trust }: { trust: "verified" | "unverified" | "pending" }) {
  const verified = trust === "verified";
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "6px 12px", border: `1.5px solid ${verified ? PINK : LINE}`, color: verified ? PINK : MUTED, fontFamily: "Geist Mono", fontSize: 16, letterSpacing: 2 }}>
      {verified ? "VERIFIED" : trust === "pending" ? "PENDING" : "SELF-REPORTED"}
    </div>
  );
}
