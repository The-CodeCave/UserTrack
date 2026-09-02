import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { OgFrame, OgEyebrow, OgChip, OgLogo, OgSpark, OgCheck, ogImage, ogWordmark, remoteImage, truncate, LINE, PINK, INK, MUTED, DIM, HOST } from "@/lib/og/frame";
import { formatCompact, formatDelta, formatPct, formatRate } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import type { Board } from "@convex/public";

type Window = "24h" | "7d" | "30d";
type Row = Awaited<ReturnType<typeof rows>>[number];

const WINDOW_LABEL: Record<Window, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

const rows = (board: Board, window: Window, category?: string) =>
  fetchQuery(api.public.board, { board, window, verifiedOnly: false, category, limit: 4 });

// The number that decides the ranking, per board — mirrors the on-page primary metric.
function metric(s: Row, board: Board, w: Window): { value: string; label: string } {
  const newIn = w === "24h" ? s.newUsers24h : w === "7d" ? s.newUsers7d : s.newUsers30d;
  const growthIn = w === "30d" ? s.growth30dPct : w === "7d" ? (s.growth7dPct ?? 0) : s.totalUsers - s.newUsers24h > 0 ? (s.newUsers24h / (s.totalUsers - s.newUsers24h)) * 100 : 0;
  switch (board) {
    case "fastest":
      return { value: formatPct(growthIn), label: `growth ${w}` };
    case "most-users":
      return { value: formatCompact(s.totalUsers), label: "users" };
    case "most-activated":
      return { value: formatCompact((w === "24h" ? s.activated24h : w === "7d" ? s.activated7d : s.activated30d) ?? s.activatedUsers ?? 0), label: `activated ${w}` };
    case "activation-rate":
      return { value: formatRate(s.activationRatePct), label: "activation" };
    case "best-conversion":
      return { value: formatRate(s.signupToConvertedPct), label: "signup → conv." };
    case "best-trial-conversion":
      return { value: formatRate(s.trialToConvertedPct), label: "trial → conv." };
    case "converted-growth":
      return { value: formatPct(s.convertedGrowth30dPct ?? 0), label: "converted 30d" };
    default:
      return { value: formatDelta(newIn), label: `new · ${w}` };
  }
}

export interface BoardOgOptions {
  board: Board;
  window?: Window;
  category?: string;
  eyebrow: string;
  title: string;
  sub: string;
  path: string;
}

// One renderer for every ranking page: leaderboard, trending, fastest, new, most new, conversion and category boards.
export async function renderBoardOg({ board, window = "30d", category, eyebrow, title, sub, path }: BoardOgOptions) {
  const list = await rows(board, window, category);
  const logos = await Promise.all(list.map((s) => remoteImage(s.logoUrl)));

  return ogImage(
    <OgFrame
      wordmark={await ogWordmark()}
      chips={
        <>
          <OgChip>{`Last ${WINDOW_LABEL[window]}`}</OgChip>
          <OgChip tone="pink" icon={<OgCheck />}>Live data</OgChip>
        </>
      }
      footerLeft={`${HOST}${path}`}
      footerRight="Read-only sources · synced every 4h"
      align="center"
    >
      <OgEyebrow>{eyebrow}</OgEyebrow>
      <div style={{ display: "flex", fontSize: title.length > 30 ? 52 : 60, fontWeight: 700, letterSpacing: -2.4, lineHeight: 1.02, marginTop: 12 }}>{truncate(title, 44)}</div>
      <div style={{ display: "flex", fontSize: 24, color: MUTED, marginTop: 10, maxWidth: 900 }}>{truncate(sub, 118)}</div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
        {list.map((s, i) => {
          const m = metric(s, board, window);
          return (
            <div key={s.slug} style={{ display: "flex", alignItems: "center", gap: 20, height: 66, borderTop: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", width: 44, fontFamily: "Geist Mono", fontSize: 24, color: i === 0 ? PINK : DIM }}>{String(i + 1).padStart(2, "0")}</div>
              <OgLogo name={s.name} src={logos[i]} size={40} radius={9} />
              <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: -0.8 }}>{truncate(s.name, 22)}</div>
              <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 17, color: DIM, letterSpacing: 1.4 }}>{categoryLabel(s.category).toUpperCase()}</div>
              <div style={{ display: "flex", marginLeft: "auto", alignItems: "center", gap: 22 }}>
                <OgSpark values={s.spark} width={130} height={34} color={i === 0 ? PINK : "rgba(255,255,255,0.45)"} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: 190 }}>
                  <div style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: -1, color: i === 0 ? PINK : INK }}>{m.value}</div>
                  <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 15, color: DIM, letterSpacing: 1.4 }}>{m.label.toUpperCase()}</div>
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div style={{ display: "flex", borderTop: `1px solid ${LINE}`, paddingTop: 28, fontSize: 28, color: MUTED }}>Be the first product on this board.</div>}
      </div>
    </OgFrame>,
  );
}
