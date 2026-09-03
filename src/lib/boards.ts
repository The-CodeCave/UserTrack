// `secondary` boards are grouped under "More rankings"; they never replace the trending / growth defaults.
export const BOARD_META: Record<string, { label: string; short: string; blurb: string; secondary?: boolean }> = {
  trending: { label: "Trending", short: "Trending", blurb: "Momentum right now: new users × growth × acceleration, discounted by trust. Not size." },
  fastest: { label: "Fastest growing", short: "Fastest", blurb: "Highest percentage growth. At least 10 new users in the window." },
  "most-new": { label: "Most new users", short: "Most new", blurb: "Absolute verified new users in the window." },
  "most-users": { label: "Most users", short: "Most users", blurb: "Largest verified user bases." },
  "most-activated": { label: "Most activated", short: "Activated", blurb: "Products whose users actually activate. Needs an activation source." },
  "activation-rate": { label: "Highest activation rate", short: "Activation %", blurb: "Activated ÷ total users. Minimum 50 users." },
  "new-rising": { label: "New & rising", short: "New", blurb: "Listed in the last 30 days, ranked by 7-day new users." },
  "hidden-gems": { label: "Hidden gems", short: "Gems", blurb: "Under 1,000 users, ≥10 new users and ≥10% growth this week, 7+ days of verified history, trust ≥ 60." },
  movers: { label: "Biggest movers", short: "Movers", blurb: "Largest 7-day climbs on the 30-day leaderboard, from stored daily rank history." },
  "best-conversion": { label: "Best Signup → Converted", short: "Conversion %", blurb: "Converted ÷ total users. Minimum 50 users. Only products that publish their conversion rate.", secondary: true },
  "best-trial-conversion": { label: "Best Trial → Converted", short: "Trial %", blurb: "Trials that converted. Only products that publish their trial conversion.", secondary: true },
  "converted-growth": { label: "Fastest growing converted users", short: "Converted growth", blurb: "30-day growth of converted users. Minimum 10 converted users. Only products that publish their conversion rate.", secondary: true },
};
export const BOARD_KEYS = Object.keys(BOARD_META);
export const PRIMARY_BOARDS = BOARD_KEYS.filter((k) => !BOARD_META[k].secondary);
export const SECONDARY_BOARDS = BOARD_KEYS.filter((k) => BOARD_META[k].secondary);

export type BoardWindow = "24h" | "7d" | "30d";
// Trending and hidden gems are weekly boards; movers ignore the window (7-day climb on the 30d board); everything else defaults to 30d.
export const defaultWindow = (board: string): BoardWindow => (board === "trending" || board === "hidden-gems" ? "7d" : "30d");
// Which windows a board can be switched to; a single entry hides the switch.
export function boardWindows(board: string): BoardWindow[] {
  if (board === "hidden-gems" || board === "movers" || board === "new-rising" || board === "most-users" || board === "activation-rate" || BOARD_META[board]?.secondary) return [defaultWindow(board)];
  return ["24h", "7d", "30d"];
}

export const PLATFORMS = [
  { key: "", label: "Any platform" },
  { key: "web", label: "Web" },
  { key: "mobile", label: "Mobile" },
  { key: "hybrid", label: "Hybrid" },
];

// Frozen monthly rankings: "2026-08" → "August 2026".
export function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Archive URL for a frozen period: /rankings/2026/08/ai (or /all).
export const rankingPath = (period: string, category: string | null | undefined) => `/rankings/${period.slice(0, 4)}/${period.slice(5, 7)}/${category ?? "all"}`;
