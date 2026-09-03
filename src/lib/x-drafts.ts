// X post drafts generated from real data. A small set of tasteful templates, rotated deterministically per event so
// consecutive posts never read identically. Pure; used by the studio, the Share Center, MCP and the auto-post job.

export type DraftKind =
  | "users" | "activated" | "converted" | "best_day" | "best_week" | "rank" | "top10" | "top100" | "streak"
  | "monthly_growth" | "trending_top10" | "spike" | "benchmark" | "growth" | "week" | "trending" | "activation" | "conversion" | "founder";

export interface DraftInput {
  kind: DraftKind;
  name: string;
  value?: number;
  title?: string;
  totalUsers?: number;
  newUsers30d?: number;
  newUsers7d?: number;
  growth30dPct?: number;
  rank?: number;
  category?: string;
  percentile?: number;
  verified: boolean;
  // Founder-authored posts mention @usertrack; UserTrack-authored posts tag the founder (only when allowed).
  author?: "founder" | "usertrack";
  founderHandle?: string;
  projectHandle?: string;
  projectCount?: number;
  seed?: string;
}

const fmt = (n: number) => new Intl.NumberFormat("en").format(Math.round(n));
const plus = (n: number) => (n >= 0 ? `+${fmt(n)}` : `−${fmt(-n)}`);
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T,>(list: T[], seed: string) => list[hash(seed) % list.length];

function subject(i: DraftInput) {
  if (i.author === "usertrack") return i.projectHandle ? `@${i.projectHandle}` : i.name;
  return "We";
}

function body(i: DraftInput): (string | undefined)[] {
  const s = subject(i);
  const third = i.author === "usertrack";
  const n = i.value ?? 0;
  const tail30 = i.newUsers30d !== undefined && i.newUsers30d > 0 ? `${plus(i.newUsers30d)} in the last 30 days.` : undefined;
  const seed = `${i.seed ?? ""}:${i.kind}:${n}`;
  switch (i.kind) {
    case "users":
      return pick([
        [`${s} just crossed ${fmt(n)} users.`, tail30],
        [third ? `${s} passed ${fmt(n)} ${i.verified ? "verified " : ""}users.` : `${fmt(n)} users. Still feels unreal.`, tail30],
        [third ? `${fmt(n)} users for ${s}.` : `${fmt(n)} people now use ${i.name}.`, tail30],
      ], seed);
    case "activated":
      return [third ? `${fmt(n)} activated users on ${s}.` : `${fmt(n)} of our users have reached the activation moment in ${i.name}.`];
    case "converted":
      return [third ? `${s} now has ${fmt(n)} converted users.` : `${fmt(n)} converted users in ${i.name}. Users, not revenue — that number stays private.`];
    case "best_day":
      return [third ? `Biggest day ever for ${s}: ${plus(n)} users in 24 hours.` : `Biggest day ever: ${plus(n)} users in 24 hours.`];
    case "best_week":
      return [third ? `Record week for ${s}: ${plus(n)} users in 7 days.` : `Best week ever for ${i.name}: ${plus(n)} users in 7 days.`];
    case "rank":
      return [third ? `${s} is #${i.rank ?? n} on the UserTrack leaderboard.` : `${i.name} just reached #${i.rank ?? n} on the UserTrack leaderboard.`];
    case "top10":
    case "top100":
      return pick([
        [third ? `${s} entered the UserTrack Top ${i.kind === "top10" ? 10 : 100} (#${i.rank ?? n}).` : `${i.name} entered the UserTrack Top ${i.kind === "top10" ? 10 : 100} — #${i.rank ?? n} by new users in the last 30 days.`],
        [third ? `Top ${i.kind === "top10" ? 10 : 100} on UserTrack: ${s} at #${i.rank ?? n}.` : `We're #${i.rank ?? n} on UserTrack by verified new users. Top ${i.kind === "top10" ? 10 : 100}.`],
      ], seed);
    case "streak":
      return [third ? `${s} has gained users every day for ${fmt(n)} days.` : `${fmt(n)} days in a row with new users. No zero days.`];
    case "monthly_growth":
      return [third ? `${s} grew its user base ${Math.round(i.growth30dPct ?? n)}% in 30 days.` : `+${Math.round(i.growth30dPct ?? n)}% users in the last 30 days.`, tail30];
    case "trending_top10":
    case "trending":
      return [third ? `${s} is #${i.rank ?? n} trending on UserTrack right now.` : `${i.name} is #${i.rank ?? n} trending on UserTrack right now.`];
    case "spike":
      return [third ? `${s} is growing ${n}× faster than usual today.` : `${n}× our normal signups today.`];
    case "benchmark":
      return [third ? `${s} is in the top ${100 - (i.percentile ?? 90)}% for ${i.title ?? "growth"}${i.category ? ` among ${i.category} SaaS` : ""}.` : `${i.name} is in the top ${100 - (i.percentile ?? 90)}% for ${i.title ?? "growth"}${i.category ? ` among ${i.category} SaaS` : ""} on UserTrack.`];
    case "growth":
      return [third ? `${s}: ${plus(i.newUsers30d ?? n)} users in the last 30 days.` : `${plus(i.newUsers30d ?? n)} users in the last 30 days${i.growth30dPct !== undefined ? ` (${i.growth30dPct >= 0 ? "+" : ""}${i.growth30dPct.toFixed(1)}%)` : ""}.`];
    case "week":
      return [third ? `${s}: ${plus(i.newUsers7d ?? n)} users this week.` : `${plus(i.newUsers7d ?? n)} users this week.`];
    case "activation":
      return [third ? `${n}% of ${s} users activate.` : `${n}% of ${i.name} signups reach the activation moment.`];
    case "conversion":
      return [third ? `${n}% of ${s} signups convert.` : `${n}% of our signups convert. Users, not revenue.`];
    case "founder":
      return [`${fmt(i.totalUsers ?? n)} users across ${i.projectCount ?? 1} ${(i.projectCount ?? 1) === 1 ? "product" : "products"}.`, tail30];
  }
}

// The closing attribution. Never claims verification for self-reported data.
function attribution(i: DraftInput) {
  if (i.author === "usertrack") {
    const by = i.founderHandle ? ` Built by @${i.founderHandle}.` : "";
    return `${i.verified ? "Verified user data." : "Tracked on UserTrack."}${by}`;
  }
  return i.verified ? "Verified by @usertrack" : "Tracked on @usertrack";
}

export function xDraft(i: DraftInput) {
  const lines = body(i).filter((l): l is string => Boolean(l));
  return [...lines, attribution(i)].join("\n\n");
}

// X counts every URL as 23 characters. Keep drafts short enough to leave room for the founder's own words.
export const X_URL_LENGTH = 23;
export const X_LIMIT = 280;
export const xLength = (text: string, withUrl = true) => [...text].length + (withUrl ? X_URL_LENGTH + 1 : 0);
export const fitsX = (text: string, withUrl = true) => xLength(text, withUrl) <= X_LIMIT;
