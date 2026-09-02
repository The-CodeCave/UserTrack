export const BOARD_META: Record<string, { label: string; short: string; blurb: string }> = {
  trending: { label: "Trending", short: "Trending", blurb: "Momentum right now: new users × growth × acceleration, discounted by trust. Not size." },
  fastest: { label: "Fastest growing", short: "Fastest", blurb: "Highest percentage growth. At least 10 new users in the window." },
  "most-new": { label: "Most new users", short: "Most new", blurb: "Absolute verified new users in the window." },
  "most-users": { label: "Most users", short: "Most users", blurb: "Largest verified user bases." },
  "most-activated": { label: "Most activated", short: "Activated", blurb: "Products whose users actually activate. Needs an activation source." },
  "activation-rate": { label: "Highest activation rate", short: "Activation %", blurb: "Activated ÷ total users. Minimum 50 users." },
  "new-rising": { label: "New & rising", short: "New", blurb: "Listed in the last 30 days, ranked by 7-day new users." },
};
