export interface DigestSaas {
  slug: string; name: string; totalUsers: number; newUsers7d: number; growth7dPct: number;
  rank?: number; prevRank?: number; trendingRank?: number; trust: string; activationRatePct?: number;
}
export interface DigestPayload {
  week: string;
  own: DigestSaas[];
  followed: DigestSaas[];
  milestones: { title: string; copy: string; slug: string; achievedAt: number }[];
  movers: DigestSaas[];
  trending: DigestSaas[];
  generatedAt: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const n = (x: number) => new Intl.NumberFormat("en").format(x);
const delta = (x: number) => (x >= 0 ? `+${n(x)}` : `−${n(-x)}`);

// Plain, table-free HTML that renders the same in every client. Brand: graphite + pink.
export function renderDigestEmail(p: DigestPayload, name: string, siteUrl: string) {
  const row = (s: DigestSaas) =>
    `<div style="padding:10px 0;border-bottom:1px solid #26282d"><a href="${siteUrl}/s/${s.slug}" style="color:#f4f4f5;text-decoration:none;font-weight:600">${esc(s.name)}</a>` +
    `<div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#8b8f98;margin-top:2px">${n(s.totalUsers)} users · <span style="color:#fb0184">${delta(s.newUsers7d)}</span> this week` +
    `${s.rank ? ` · #${s.rank}${s.prevRank && s.prevRank !== s.rank ? ` (was #${s.prevRank})` : ""}` : ""}${s.trendingRank ? ` · trending #${s.trendingRank}` : ""}</div></div>`;
  const section = (title: string, body: string) => (body ? `<h2 style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b8f98;margin:28px 0 6px">${title}</h2>${body}` : "");
  return `<!doctype html><html><body style="margin:0;background:#0b0c0e;color:#f4f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.14em;color:#8b8f98">USERTRACK · WEEK ${esc(p.week)}</div>
  <h1 style="font-size:24px;margin:8px 0 0">Hi ${esc(name)}, here is your growth week.</h1>
  ${section("Your products", p.own.map(row).join(""))}
  ${section("Products you follow", p.followed.map(row).join(""))}
  ${section("Milestones", p.milestones.map((m) => `<div style="padding:10px 0;border-bottom:1px solid #26282d"><b>${esc(m.title)}</b><div style="font-size:13px;color:#8b8f98">${esc(m.copy)}</div></div>`).join(""))}
  ${section("Leaderboard movers", p.movers.map(row).join(""))}
  ${section("Trending now", p.trending.map(row).join(""))}
  <p style="margin-top:32px;font-size:12px;color:#8b8f98">You receive this because you have a UserTrack account. Turn it off in <a href="${siteUrl}/app/settings" style="color:#fb0184">Settings</a>.</p>
</div></body></html>`;
}
