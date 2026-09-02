// `secondary` boards are grouped under "More rankings"; they never replace the trending / growth defaults.
export const BOARD_META: Record<string, { label: string; short: string; blurb: string; secondary?: boolean }> = {
  trending: { label: "Trending", short: "Trending", blurb: "Momentum right now: new users × growth × acceleration, discounted by trust. Not size." },
  fastest: { label: "Fastest growing", short: "Fastest", blurb: "Highest percentage growth. At least 10 new users in the window." },
  "most-new": { label: "Most new users", short: "Most new", blurb: "Absolute verified new users in the window." },
  "most-users": { label: "Most users", short: "Most users", blurb: "Largest verified user bases." },
  "most-activated": { label: "Most activated", short: "Activated", blurb: "Products whose users actually activate. Needs an activation source." },
  "activation-rate": { label: "Highest activation rate", short: "Activation %", blurb: "Activated ÷ total users. Minimum 50 users." },
  "new-rising": { label: "New & rising", short: "New", blurb: "Listed in the last 30 days, ranked by 7-day new users." },
  "best-conversion": { label: "Best Signup → Converted", short: "Conversion %", blurb: "Converted ÷ total users. Minimum 50 users. Only products that publish their conversion rate.", secondary: true },
  "best-trial-conversion": { label: "Best Trial → Converted", short: "Trial %", blurb: "Trials that converted. Only products that publish their trial conversion.", secondary: true },
  "converted-growth": { label: "Fastest growing converted users", short: "Converted growth", blurb: "30-day growth of converted users. Minimum 10 converted users. Only products that publish their conversion rate.", secondary: true },
};
export const BOARD_KEYS = Object.keys(BOARD_META);
export const PRIMARY_BOARDS = BOARD_KEYS.filter((k) => !BOARD_META[k].secondary);
export const SECONDARY_BOARDS = BOARD_KEYS.filter((k) => BOARD_META[k].secondary);
