import type { EmailType } from "../types";
import type { MonthlyPayload, ProjectReport } from "../../lib/emailRules";
import { attributedUrl } from "../../../src/lib/site";
import { BRAND, button, dateStr, delta, esc, label, layout, metric, metricRow, muted, num, paragraph, pctStr, row, section, text } from "./layout";

export interface RenderContext {
  siteUrl: string;
  prefsUrl?: string;
  unsubscribeUrl?: string;
  // Set by renderEmail: becomes utm_medium on every app link.
  emailType?: EmailType;
}

export interface Rendered {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export interface WeeklyDigestData {
  week: string;
  name: string;
  own: { slug: string; name: string; totalUsers: number; newUsers7d: number; rank?: number; prevRank?: number; trendingRank?: number }[];
  followed: { slug: string; name: string; totalUsers: number; newUsers7d: number; rank?: number; prevRank?: number }[];
  milestones: { title: string; copy: string; slug: string }[];
  movers: { slug: string; name: string; rank?: number; prevRank?: number; newUsers7d: number }[];
  trending: { slug: string; name: string; trendingRank?: number; newUsers7d: number }[];
}

export interface TemplateData {
  welcome: { name: string; verifyUrl?: string };
  "verify-email": { name: string; verifyUrl: string };
  "reset-password": { name: string; resetUrl: string };
  "account-deleted": { name: string };
  "profile-reminder": { name: string };
  "missing-source": { name: string; saasName: string; saasId: string };
  "source-connected": { saasName: string; slug: string; saasId: string; totalUsers?: number; trust: "verified" | "unverified" | "pending"; provider: string; isPublic: boolean };
  "source-failed": { saasName: string; saasId: string; provider: string; error?: string; lastSuccessAt?: number; failures: number };
  "source-recovered": { saasName: string; saasId: string; provider: string; totalUsers?: number; downForMs: number };
  "embed-nudge": { saasName: string; slug: string; saasId: string; totalUsers: number };
  "user-milestone": { saasName: string; slug: string; threshold: number; totalUsers: number; previousThreshold?: number; sinceMs?: number; isPublic: boolean };
  "rank-milestone": { saasName: string; slug: string; threshold: number; rank: number; newUsers30d: number; growth30dPct: number };
  "growth-spike": { saasName: string; slug: string; saasId: string; last24h: number; average: number; multiple: number; days: number; totalUsers: number };
  "no-growth": { saasName: string; slug: string; saasId: string; totalUsers: number; newUsers30d: number; days: number };
  "monthly-report": { name: string; report: MonthlyPayload };
  "weekly-digest": WeeklyDigestData;
  "followed-update": { saasName: string; slug: string; kind: "milestone" | "rank" | "spike"; headline: string; detail: string };
}

const fmtDuration = (ms: number) => {
  const d = Math.round(ms / 86_400_000);
  if (d < 1) return "under a day";
  if (d < 30) return `${d} day${d === 1 ? "" : "s"}`;
  const m = Math.round(d / 30);
  return `${m} month${m === 1 ? "" : "s"}`;
};

// Every app link out of an email is attributable (docs/ANALYTICS.md). Signed prefs / unsubscribe / verify / reset links never go through here.
const link = (c: RenderContext, path: string, campaign = path.split("/").filter(Boolean).pop() ?? "home") => attributedUrl(`${c.siteUrl}${path}`, { ref: "email", source: "email", medium: c.emailType ?? "email", campaign });
const saasUrl = (c: RenderContext, slug: string) => link(c, `/s/${slug}`, "product");
const manageUrl = (c: RenderContext, saasId: string) => link(c, `/app/saas/${saasId}`, "manage");
const shareUrl = (c: RenderContext, slug: string, kind: string) => link(c, `/s/${slug}/share/${kind}`, kind);
const shareCenter = (c: RenderContext) => muted(`A ready-made share card is waiting in your <a href="${esc(link(c, "/app/share"))}" style="color:${BRAND.ink}">Share Center</a> — download the PNG or post it to X in one click.`);

type Builder<T extends EmailType> = (data: TemplateData[T], c: RenderContext) => Rendered;

const TRANSACTIONAL_FOOTER = "This is a service message about your UserTrack account.";
const growthFooter = (c: RenderContext) => (c.prefsUrl ? "You get growth notifications for products you own on UserTrack." : "You get growth notifications for products you own on UserTrack. Change this in Settings → Notifications.");
const nudgeFooter = "You get setup reminders while your UserTrack account is getting started.";

const welcome: Builder<"welcome"> = (d, c) => {
  const cta = d.verifyUrl ? { label: "Confirm email & set up your profile", url: d.verifyUrl } : { label: "Set up your profile", url: link(c, "/app/onboarding") };
  const body = `<div style="margin:6px 0 4px">${["Connect a read-only data source — Clerk, Supabase, Firebase, Auth0 or your own endpoint.", "Get a public growth page with a verified user count, synced every 4 hours.", "Get ranked on the leaderboard and share your traction with real numbers."].map((s, i) => `<div style="padding:8px 0;border-top:1px solid ${BRAND.line};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink}"><span style="font-family:ui-monospace,Menlo,monospace;color:${BRAND.pink};margin-right:10px">0${i + 1}</span>${esc(s)}</div>`).join("")}</div>`;
  return {
    subject: "Welcome to UserTrack",
    preheader: "Track your SaaS user growth, build a public profile, get ranked.",
    html: layout({ siteUrl: c.siteUrl, eyebrow: "WELCOME", title: `Hi ${esc(d.name)}, welcome to UserTrack.`, intro: "UserTrack turns your real user count into a public, verified growth page. Three steps and you are on the board:", body, cta, footerNote: TRANSACTIONAL_FOOTER + (d.verifyUrl ? " The confirmation link is valid for 24 hours." : "") }),
    text: text([`Hi ${d.name}, welcome to UserTrack.`, "1. Connect a read-only data source.\n2. Get a public growth page, synced every 4 hours.\n3. Get ranked and share your traction.", `${cta.label}: ${cta.url}`]),
  };
};

const verifyEmail: Builder<"verify-email"> = (d, c) => ({
  subject: "Confirm your UserTrack email",
  preheader: "One click to verify your address.",
  html: layout({ siteUrl: c.siteUrl, eyebrow: "ACCOUNT", title: "Confirm your email address", intro: `Hi ${esc(d.name)}, confirm that this is your address so account notifications reach you. The link is valid for 24 hours.`, cta: { label: "Confirm email", url: d.verifyUrl }, body: muted("If you did not create a UserTrack account, you can ignore this email."), footerNote: TRANSACTIONAL_FOOTER }),
  text: text([`Hi ${d.name}, confirm your UserTrack email address:`, d.verifyUrl, "If you did not create a UserTrack account, ignore this email."]),
});

const resetPassword: Builder<"reset-password"> = (d, c) => ({
  subject: "Reset your UserTrack password",
  preheader: "This link expires in one hour.",
  html: layout({ siteUrl: c.siteUrl, eyebrow: "SECURITY", title: "Reset your password", intro: `Hi ${esc(d.name)}, someone requested a password reset for this account. The link expires in one hour and can be used once.`, cta: { label: "Choose a new password", url: d.resetUrl }, body: muted("If this was not you, no action is needed — your password stays the same."), footerNote: TRANSACTIONAL_FOOTER }),
  text: text([`Hi ${d.name}, reset your UserTrack password (valid for one hour):`, d.resetUrl, "If this was not you, no action is needed."]),
});

const accountDeleted: Builder<"account-deleted"> = (d, c) => ({
  subject: "Your UserTrack account was deleted",
  preheader: "Profile, products, sources, tokens and preferences are gone.",
  html: layout({ siteUrl: c.siteUrl, eyebrow: "ACCOUNT", title: "Your account has been deleted", intro: `Hi ${esc(d.name)}, as requested we deleted your UserTrack account: profile, products and their growth history, connected-source credentials, API and MCP tokens, webhooks, follows, the X connection and your email preferences. Public pages are already gone. This cannot be undone.`, body: muted("If you did not request this, reply to this email right away. You are welcome back any time — a new account starts from zero."), footerNote: TRANSACTIONAL_FOOTER + " It is the last email you will receive from UserTrack." }),
  text: text([`Hi ${d.name}, your UserTrack account has been deleted as requested: profile, products, growth history, source credentials, tokens, webhooks, follows, X connection and email preferences.`, "Public pages are already gone. This cannot be undone.", "If you did not request this, reply to this email right away."]),
});

const profileReminder: Builder<"profile-reminder"> = (d, c) => ({
  subject: "Finish setting up your UserTrack profile",
  preheader: "Your public growth page is one step away.",
  html: layout({ siteUrl: c.siteUrl, eyebrow: "SETUP", title: "Your profile is still empty", intro: `Hi ${esc(d.name)}, you created a UserTrack account yesterday but have not set up a founder profile yet. It takes about a minute: a handle, a name, and you are ready to add your first product.`, cta: { label: "Complete profile", url: link(c, "/app/onboarding") }, footerNote: nudgeFooter + " This is the only reminder you will get about it.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
  text: text([`Hi ${d.name}, your UserTrack profile is still empty. Finish it here:`, link(c, "/app/onboarding"), "This is the only reminder you will get about it."]),
});

const missingSource: Builder<"missing-source"> = (d, c) => ({
  subject: `Connect ${d.saasName} to start tracking growth`,
  preheader: "No data source yet — nothing is being tracked.",
  html: layout({ siteUrl: c.siteUrl, eyebrow: "SETUP", title: `${esc(d.saasName)} has no data source yet`, intro: `Hi ${esc(d.name)}, you added ${esc(d.saasName)} a day ago, but no user data source is connected. Until it is, nothing is tracked. Connecting one is read-only and takes a couple of minutes.`, body: `${section("What you get", [row("Growth tracking", "A snapshot every 4 hours and a growth chart that never lies."), row("Leaderboard eligibility", "Only verified sources get ranked."), row("Verified history", "Your full signup history backfilled from providers that support it.")].join(""))}`, cta: { label: "Connect data source", url: manageUrl(c, d.saasId) }, footerNote: nudgeFooter + " You will not get this reminder again for this product.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
  text: text([`Hi ${d.name}, ${d.saasName} has no data source connected yet, so nothing is tracked.`, `Connect one here: ${manageUrl(c, d.saasId)}`]),
});

const sourceConnected: Builder<"source-connected"> = (d, c) => {
  const trust = d.trust === "verified" ? "Verified" : d.trust === "unverified" ? "Self-reported" : "Pending";
  const cta = d.isPublic ? { label: "View public page", url: saasUrl(c, d.slug) } : { label: "Open dashboard", url: manageUrl(c, d.saasId) };
  return {
    subject: `${d.saasName} is now syncing with UserTrack`,
    preheader: d.totalUsers !== undefined ? `${num(d.totalUsers)} users detected via ${d.provider}.` : `Connected via ${d.provider}.`,
    html: layout({ siteUrl: c.siteUrl, eyebrow: "CONNECTED", title: `${esc(d.saasName)} is connected`, intro: `The first snapshot from ${esc(d.provider)} is in. From now on UserTrack syncs automatically every 4 hours; failed syncs retry on their own.`, body: metricRow([metric("Users detected", d.totalUsers !== undefined ? num(d.totalUsers) : "—", undefined, true), metric("Verification", trust, `via ${d.provider}`)]) + (d.isPublic ? "" : muted("Your page is still a draft. Publish it from the dashboard when you are ready.")), cta, footerNote: nudgeFooter, prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
    text: text([`${d.saasName} is connected via ${d.provider}.`, d.totalUsers !== undefined ? `Users detected: ${num(d.totalUsers)} (${trust}). Next sync in 4 hours.` : `Verification: ${trust}. Next sync in 4 hours.`, `${cta.label}: ${cta.url}`]),
  };
};

// The exact markup /app/saas/[id]/embed hands out — same URLs, same badge attribution, so the two never drift apart.
function badgePrompt(d: TemplateData["embed-nudge"], siteUrl: string) {
  const img = `${siteUrl}/api/badge/${d.slug}.svg?type=users`;
  const page = attributedUrl(`${siteUrl}/s/${d.slug}`, { ref: "badge", source: "badge", medium: "image", campaign: "users" });
  return `Add the UserTrack badge for "${d.saasName}" to my landing page.

USE THIS EXACT MARKUP - do not rebuild it, do not re-host the SVG, do not change the query string:

<a href="${page}"><img src="${img}" alt="${d.saasName} on UserTrack" height="28"></a>

For a README or Markdown docs use this form instead:

[![${d.saasName} on UserTrack](${img})](${page})

FIRST, CHECK THE LANDING PAGE IS ACTUALLY IN THIS REPOSITORY
A marketing site often lives somewhere else - a separate repo, or Framer / Webflow / WordPress. Before you change anything, find the file that renders the public landing page and tell me its path and the line you plan to edit. If you cannot find one, stop and tell me. Do not create a page, a component or a section to hold the badge, and do not put it in the signed-in app UI instead.

WHERE IT GOES
Where social proof already lives: a footer, a "trusted by" or "as seen on" strip, or the badge row under the H1 in README.md. If nothing like that exists, the site footer next to the copyright is the right place.

RULES
- Keep the <a> wrapper and the link target - an unlinked badge is not the point of it.
- Keep height="28" and never set a width; the SVG scales itself.
- Load it with a plain <img>. Do NOT route it through next/image, an image CDN or any optimizer: it is a remote SVG that has to stay live.
- In JSX/TSX: class becomes className, self-close <img />, keep href, src, alt and height exactly as above.
- If this project sets a Content-Security-Policy, add ${new URL(siteUrl).host} to img-src, and nothing else.
- Change nothing else: no restyling, no refactors, no new dependencies.

Then run this project's typecheck / lint / build, fix anything you broke, do not commit, and report the file you touched and where the badge is now visible.`;
}

const embedNudge: Builder<"embed-nudge"> = (d, c) => {
  const prompt = badgePrompt(d, c.siteUrl);
  const embedUrl = link(c, `/app/saas/${d.saasId}/embed`, "embed");
  const body =
    metricRow([metric("Users on your page", num(d.totalUsers), "verified and syncing", true), metric("Badge", "28px SVG", "cached 1h at the edge")]) +
    section("Hand this to your coding agent", `${muted("It carries your real slug, the badge URL and the rules that keep it working. Copy the whole block.")}<div style="margin:6px 0 0;padding:12px 14px;border:1px solid ${BRAND.line};background:${BRAND.bg};font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.5;color:${BRAND.ink};white-space:pre-wrap;word-break:break-word">${esc(prompt)}</div>`) +
    muted(`Prefer live numbers that count up on their own? The <a href="${esc(embedUrl)}" style="color:${BRAND.ink}">embed page</a> also has the JavaScript widget, plus other badge styles, themes and a README version.`);
  return {
    subject: `Put your ${num(d.totalUsers)} users on your own site`,
    preheader: `A ready-made prompt that adds the ${d.saasName} badge to your landing page.`,
    html: layout({ siteUrl: c.siteUrl, eyebrow: "BADGE", title: `${esc(d.saasName)} has numbers worth showing`, intro: `${esc(d.saasName)} has been syncing for a few days and its public page now shows ${num(d.totalUsers)} verified users. The UserTrack badge puts that number on your own landing page and keeps it current on its own - it re-renders from live data, so you never edit it again.`, body, cta: { label: "Open embed page", url: embedUrl }, footerNote: nudgeFooter + " This is the only time we will ask about the badge.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
    text: text([`${d.saasName} now shows ${num(d.totalUsers)} verified users on UserTrack.`, "The badge puts that number on your own landing page and keeps it current on its own. Paste the prompt below into your coding agent:", prompt, `More badge styles, themes and the live JavaScript widget: ${embedUrl}`]),
  };
};

const sourceFailed: Builder<"source-failed"> = (d, c) => ({
  subject: `UserTrack stopped syncing ${d.saasName}`,
  preheader: `${d.failures} failed syncs in a row — public data will go stale.`,
  html: layout({ siteUrl: c.siteUrl, eyebrow: "INTEGRATION", title: `${esc(d.saasName)} is no longer syncing`, intro: `The ${esc(d.provider)} source for ${esc(d.saasName)} has failed ${d.failures} times in a row${d.lastSuccessAt ? `; the last successful sync was ${esc(dateStr(d.lastSuccessAt))}` : ""}. Until it is fixed the public page shows stale numbers and the product drops out of the rankings.`, body: d.error ? `${label("Last error")}<div style="margin:6px 0 14px;padding:10px 12px;border:1px solid ${BRAND.line};font-family:ui-monospace,Menlo,monospace;font-size:12px;color:${BRAND.muted};word-break:break-word">${esc(d.error.slice(0, 240))}</div>` : "", cta: { label: "Fix integration", url: manageUrl(c, d.saasId) }, footerNote: TRANSACTIONAL_FOOTER + " You will get one more email when syncing recovers." }),
  text: text([`The ${d.provider} source for ${d.saasName} has failed ${d.failures} times in a row.`, d.error ? `Last error: ${d.error.slice(0, 240)}` : undefined, `Fix it here: ${manageUrl(c, d.saasId)}`]),
});

const sourceRecovered: Builder<"source-recovered"> = (d, c) => ({
  subject: `${d.saasName} is syncing again`,
  preheader: "Integration recovered — no action needed.",
  html: layout({ siteUrl: c.siteUrl, eyebrow: "INTEGRATION", title: `${esc(d.saasName)} recovered`, intro: `The ${esc(d.provider)} source is syncing again after ${esc(fmtDuration(d.downForMs))}${d.totalUsers !== undefined ? ` — current count ${num(d.totalUsers)} users` : ""}. Rankings resume with the next rerank. Nothing else to do.`, secondary: { label: "Open dashboard", url: manageUrl(c, d.saasId) }, footerNote: TRANSACTIONAL_FOOTER }),
  text: text([`${d.saasName} is syncing again via ${d.provider} after ${fmtDuration(d.downForMs)}.`, `Dashboard: ${manageUrl(c, d.saasId)}`]),
});

const userMilestone: Builder<"user-milestone"> = (d, c) => {
  const sub = d.previousThreshold && d.sinceMs !== undefined ? `${num(d.previousThreshold)} → ${num(d.threshold)} in ${fmtDuration(d.sinceMs)}` : `${num(d.totalUsers)} users right now`;
  const cta = d.isPublic ? { label: "Share milestone", url: shareUrl(c, d.slug, "users") } : { label: "Open dashboard", url: link(c, "/app") };
  return {
    subject: `${d.saasName} just crossed ${num(d.threshold)} users`,
    preheader: sub,
    html: layout({ siteUrl: c.siteUrl, eyebrow: "MILESTONE", title: `${esc(d.saasName)} crossed ${num(d.threshold)} users`, intro: `Verified by your connected data source, not typed in. That is worth telling people about.`, body: metricRow([metric("Milestone", num(d.threshold), undefined, true), metric("Total now", num(d.totalUsers), d.previousThreshold && d.sinceMs !== undefined ? `since ${num(d.previousThreshold)}: ${fmtDuration(d.sinceMs)}` : undefined)]) + (d.isPublic ? shareCenter(c) : muted("Your page is a draft — publish it to get a share card with this milestone.")), cta, secondary: d.isPublic ? { label: "View public page", url: saasUrl(c, d.slug) } : undefined, footerNote: growthFooter(c), prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
    text: text([`${d.saasName} just crossed ${num(d.threshold)} users (${num(d.totalUsers)} now).`, sub, `${cta.label}: ${cta.url}`, d.isPublic ? `Share Center: ${link(c, "/app/share")}` : undefined]),
  };
};

const rankMilestone: Builder<"rank-milestone"> = (d, c) => {
  const tier = d.threshold === 1 ? "#1" : `Top ${d.threshold}`;
  return {
    subject: d.threshold === 1 ? `${d.saasName} is #1 on UserTrack` : `${d.saasName} entered the UserTrack ${tier}`,
    preheader: `#${d.rank} by verified new users in the last 30 days.`,
    html: layout({ siteUrl: c.siteUrl, eyebrow: "LEADERBOARD", title: d.threshold === 1 ? `${esc(d.saasName)} is #1 on UserTrack` : `${esc(d.saasName)} entered the ${tier}`, intro: `Ranked by verified new users over the last 30 days, across every public product on UserTrack.`, body: metricRow([metric("Current rank", `#${d.rank}`, "last 30 days", true), metric("New users · 30d", delta(d.newUsers30d), pctStr(d.growth30dPct))]) + shareCenter(c), cta: { label: "Share ranking", url: shareUrl(c, d.slug, "rank") }, secondary: { label: "View leaderboard", url: link(c, "/leaderboard") }, footerNote: growthFooter(c) + " Ranking emails only go out at Top 100 / 50 / 25 / 10 / 5 / #1.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
    text: text([`${d.saasName} entered the UserTrack ${tier}: #${d.rank} by verified new users in the last 30 days (${delta(d.newUsers30d)}, ${pctStr(d.growth30dPct)}).`, `Share: ${shareUrl(c, d.slug, "rank")}`]),
  };
};

const growthSpike: Builder<"growth-spike"> = (d, c) => ({
  subject: `${d.saasName} is growing ${d.multiple}x faster today`,
  preheader: `${num(d.last24h)} signups in 24h vs a ${d.average}/day average.`,
  html: layout({ siteUrl: c.siteUrl, eyebrow: "GROWTH ALERT", title: `${esc(d.saasName)} is ${d.multiple}× above baseline`, intro: `Your signups in the last 24 hours are ${d.multiple}× your ${d.days}-day daily average. Worth checking where they are coming from while it is happening.`, body: metricRow([metric("Last 24 hours", delta(d.last24h), "new users", true), metric("Daily average", `${d.average}`, `last ${d.days} days`)]), cta: { label: "View growth", url: manageUrl(c, d.saasId) }, secondary: { label: "Share the moment", url: shareUrl(c, d.slug, "growth") }, footerNote: growthFooter(c) + " Spike alerts have a 7-day cooldown per product.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
  text: text([`${d.saasName}: ${num(d.last24h)} signups in the last 24h, ${d.multiple}x your ${d.days}-day average of ${d.average}/day.`, `View growth: ${manageUrl(c, d.saasId)}`]),
});

const noGrowth: Builder<"no-growth"> = (d, c) => ({
  subject: `${d.saasName}: no new users in ${d.days} days`,
  preheader: `${delta(d.newUsers30d)} in the last 30 days, none this week.`,
  html: layout({ siteUrl: c.siteUrl, eyebrow: "GROWTH", title: `${esc(d.saasName)} has been quiet for ${d.days} days`, intro: `The data source is healthy and syncing — there just have not been any new signups this week, after ${delta(d.newUsers30d)} over the last 30 days. Sometimes that is seasonality; sometimes a signup form broke. A quick look is usually worth it.`, body: metricRow([metric("This week", "±0", "new users"), metric("Last 30 days", delta(d.newUsers30d), `${num(d.totalUsers)} total`)]), cta: { label: "Review growth", url: manageUrl(c, d.saasId) }, footerNote: growthFooter(c) + " You get this once per quiet period; it resets when growth resumes.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
  text: text([`${d.saasName}: no new users in ${d.days} days (${delta(d.newUsers30d)} in the last 30 days). The data source is healthy.`, `Review: ${manageUrl(c, d.saasId)}`]),
});

function projectBlock(p: ProjectReport, c: RenderContext) {
  const rank = p.rankStart !== undefined || p.rankEnd !== undefined ? `#${p.rankStart ?? "—"} → #${p.rankEnd ?? "—"}` : undefined;
  const cells = [
    metric("New users", delta(p.newUsers), pctStr(p.growthPct), p.newUsers > 0),
    metric("Total users", num(p.usersEnd), `from ${num(p.usersStart)}`),
  ];
  const extra: string[] = [];
  if (p.newActivated !== undefined) extra.push(metric("Activated", delta(p.newActivated), p.activationRatePct !== undefined ? `${p.activationRatePct}% activation rate` : undefined));
  if (p.convertedEnd !== undefined) extra.push(metric("Converted users", num(p.convertedEnd), p.newConverted !== undefined ? `${delta(p.newConverted)} this month` : undefined));
  if (p.signupToConvertedPct !== undefined) extra.push(metric("Signup → converted", `${p.signupToConvertedPct}%`, p.trialToConvertedPct !== undefined ? `${p.trialToConvertedPct}% trial → converted` : undefined));
  if (rank) extra.push(metric("Leaderboard", rank, "start → end of month"));
  if (p.bestDay) extra.push(metric("Biggest day", delta(p.bestDay.newUsers), dateStr(Date.parse(`${p.bestDay.day}T12:00:00Z`))));
  const rows = [metricRow(cells)];
  for (let i = 0; i < extra.length; i += 2) rows.push(`<div style="height:8px"></div>${metricRow(extra.slice(i, i + 2))}`);
  const ms = p.milestones.length ? `<div style="margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:${BRAND.muted}">Milestones: ${esc(p.milestones.map((m) => m.title).join(" · "))}</div>` : "";
  const funnel = p.funnelChanges?.length ? `<div style="margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:${BRAND.muted}">Funnel changes: ${esc(p.funnelChanges.join(" · "))}</div>` : "";
  const title = p.isPublic ? `<a href="${esc(saasUrl(c, p.slug))}" style="color:${BRAND.ink};text-decoration:none">${esc(p.name)}</a>` : esc(p.name);
  return `<div style="margin-top:22px;padding-top:16px;border-top:1px solid ${BRAND.line}"><div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:${BRAND.ink};margin-bottom:10px">${title}${p.hasData ? "" : ` <span style="font-weight:400;color:${BRAND.muted};font-size:12px">no data this month</span>`}</div>${p.hasData ? rows.join("") + funnel + ms : muted("No snapshots were recorded — connect or fix the data source to include it next month.")}</div>`;
}

const monthlyReport: Builder<"monthly-report"> = (d, c) => {
  const r = d.report;
  const s = r.summary;
  const summary = metricRow([
    metric("New users", delta(s.totalNewUsers), "across all products", true),
    metric("Total users", num(s.totalUsersEnd), s.aggregateGrowthPct !== null ? `${pctStr(s.aggregateGrowthPct)} this month` : undefined),
    ...(s.totalNewConverted !== undefined ? [metric("Converted users", delta(s.totalNewConverted), "new this month")] : []),
  ]);
  // "+1,842 new users · 68% activated · 8.4% converted · 9,120 total"
  const line = (p: ProjectReport) => [`${delta(p.newUsers)} new users`, pctStr(p.growthPct), p.activationRatePct !== undefined ? `${Math.round(p.activationRatePct)}% activated` : "", p.signupToConvertedPct !== undefined ? `${p.signupToConvertedPct}% converted` : "", `${num(p.usersEnd)} total`].filter(Boolean).join(" · ");
  const highlights = [s.strongest ? row("Strongest product", esc(s.strongest)) : "", s.biggestMilestone ? row("Biggest milestone", esc(s.biggestMilestone)) : ""].join("");
  const projects = r.projects.map((p) => projectBlock(p, c)).join("");
  return {
    subject: `Your ${r.label.split(" ")[0]} growth report`,
    preheader: `${delta(s.totalNewUsers)} users across ${r.projects.length} product${r.projects.length === 1 ? "" : "s"}.`,
    html: layout({ siteUrl: c.siteUrl, eyebrow: r.label.toUpperCase(), title: `Your ${r.label.split(" ")[0]} on UserTrack`, intro: `Hi ${esc(d.name)}, here is the completed month for every product you track.`, body: summary + section("Highlights", highlights) + projects, cta: { label: "View full report", url: link(c, `/app/reports/${r.period}`, "report") }, footerNote: "You get one consolidated report per month for the products you own.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
    text: text([
      `Your ${r.label} on UserTrack`,
      `${delta(s.totalNewUsers)} new users across all products · ${num(s.totalUsersEnd)} total`,
      ...r.projects.map((p) => (p.hasData ? `${p.name}\n${line(p)}${p.rankStart !== undefined || p.rankEnd !== undefined ? ` · #${p.rankStart ?? "—"} → #${p.rankEnd ?? "—"}` : ""}${p.funnelChanges?.length ? `\nFunnel: ${p.funnelChanges.join(" · ")}` : ""}` : `${p.name}\nno data this month`)),
      `Full report: ${link(c, `/app/reports/${r.period}`, "report")}`,
    ]),
  };
};

const weeklyDigest: Builder<"weekly-digest"> = (d, c) => {
  const line = (s: { slug: string; name: string; totalUsers?: number; newUsers7d: number; rank?: number; prevRank?: number; trendingRank?: number }) =>
    row(s.name, `${s.totalUsers !== undefined ? `${num(s.totalUsers)} users · ` : ""}<span style="color:${BRAND.pink}">${delta(s.newUsers7d)}</span> this week${s.rank ? ` · #${s.rank}${s.prevRank && s.prevRank !== s.rank ? ` (was #${s.prevRank})` : ""}` : ""}${s.trendingRank ? ` · trending #${s.trendingRank}` : ""}`, saasUrl(c, s.slug));
  const body = [
    section("Your products", d.own.map(line).join("")),
    section("Products you follow", d.followed.map(line).join("")),
    section("Milestones", d.milestones.map((m) => row(m.title, esc(m.copy), saasUrl(c, m.slug))).join("")),
    section("Leaderboard movers", d.movers.map(line).join("")),
    section("Trending now", d.trending.map(line).join("")),
  ].join("");
  return {
    subject: "Your week on UserTrack",
    preheader: d.own.length ? `${delta(d.own.reduce((a, s) => a + s.newUsers7d, 0))} users across your products this week.` : "Movers, milestones and what is trending.",
    html: layout({ siteUrl: c.siteUrl, eyebrow: `WEEK ${d.week}`, title: `Hi ${esc(d.name)}, here is your growth week.`, body, cta: { label: "Open dashboard", url: link(c, "/app") }, footerNote: "Weekly digest — optional, Monday mornings.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
    text: text([`Week ${d.week} on UserTrack`, ...d.own.map((s) => `${s.name}: ${delta(s.newUsers7d)} this week${s.rank ? ` · #${s.rank}` : ""}`), `Dashboard: ${link(c, "/app")}`]),
  };
};

const followedUpdate: Builder<"followed-update"> = (d, c) => ({
  subject: d.headline,
  preheader: d.detail,
  html: layout({ siteUrl: c.siteUrl, eyebrow: "FOLLOWING", title: esc(d.headline), intro: esc(d.detail), cta: { label: `View ${d.saasName}`, url: saasUrl(c, d.slug) }, footerNote: "You follow this product on UserTrack. Followed-product updates are limited to major milestones, Top 10 entries and exceptional spikes.", prefsUrl: c.prefsUrl, unsubscribeUrl: c.unsubscribeUrl }),
  text: text([d.headline, d.detail, saasUrl(c, d.slug)]),
});

const BUILDERS: { [T in EmailType]: Builder<T> } = {
  welcome,
  "verify-email": verifyEmail,
  "reset-password": resetPassword,
  "account-deleted": accountDeleted,
  "profile-reminder": profileReminder,
  "missing-source": missingSource,
  "source-connected": sourceConnected,
  "source-failed": sourceFailed,
  "source-recovered": sourceRecovered,
  "embed-nudge": embedNudge,
  "user-milestone": userMilestone,
  "rank-milestone": rankMilestone,
  "growth-spike": growthSpike,
  "no-growth": noGrowth,
  "monthly-report": monthlyReport,
  "weekly-digest": weeklyDigest,
  "followed-update": followedUpdate,
};

export function renderEmail<T extends EmailType>(type: T, data: TemplateData[T], ctx: RenderContext): Rendered {
  return (BUILDERS[type] as Builder<T>)(data, { ...ctx, emailType: type });
}

export { paragraph, button };
