// Table-based, inline-styled HTML that survives Gmail / Outlook / Apple Mail. Brand: graphite, white linework, pink accent.

export const BRAND = { bg: "#0b0c0e", card: "#121316", ink: "#f4f4f5", muted: "#8b8f98", line: "#2a2c31", lineStrong: "#4a4d55", pink: "#fb0184" };
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,Menlo,Consolas,'Liberation Mono',monospace";

export const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const num = (x: number) => new Intl.NumberFormat("en").format(Math.round(x));
export const delta = (x: number) => (x > 0 ? `+${num(x)}` : x < 0 ? `−${num(-x)}` : "±0");
export const pctStr = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(1)}%`);
export const dateStr = (ts: number) => new Date(ts).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export interface LayoutOptions {
  siteUrl: string;
  preheader?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  body?: string;
  cta?: { label: string; url: string };
  secondary?: { label: string; url: string };
  footerNote: string;
  prefsUrl?: string;
  unsubscribeUrl?: string;
}

export function button(label: string, url: string, variant: "pink" | "outline" = "pink") {
  const bg = variant === "pink" ? BRAND.pink : "transparent";
  const border = variant === "pink" ? BRAND.pink : BRAND.lineStrong;
  const color = variant === "pink" ? "#ffffff" : BRAND.ink;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0"><tr><td align="center" bgcolor="${bg}" style="border:1px solid ${border};background:${bg}"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:14px;font-weight:600;color:${color};text-decoration:none">${esc(label)}</a></td></tr></table>`;
}

export function label(text: string) {
  return `<div style="font-family:${MONO};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.muted}">${esc(text)}</div>`;
}

export function metric(labelText: string, value: string, sub?: string, accent = false) {
  return `<td valign="top" width="50%" style="padding:14px 16px;border:1px solid ${BRAND.line};background:${BRAND.bg}">${label(labelText)}<div style="margin-top:6px;font-family:${SANS};font-size:26px;font-weight:600;line-height:1.1;color:${accent ? BRAND.pink : BRAND.ink}">${esc(value)}</div>${sub ? `<div style="margin-top:4px;font-family:${MONO};font-size:12px;color:${BRAND.muted}">${esc(sub)}</div>` : ""}</td>`;
}

export function metricRow(cells: string[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0"><tr>${cells.join(`<td width="8" style="width:8px"></td>`)}</tr></table>`;
}

export function row(title: string, meta: string, url?: string) {
  const t = url ? `<a href="${esc(url)}" style="color:${BRAND.ink};text-decoration:none;font-weight:600">${esc(title)}</a>` : `<span style="color:${BRAND.ink};font-weight:600">${esc(title)}</span>`;
  return `<div style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font-family:${SANS};font-size:14px">${t}<div style="margin-top:2px;font-family:${MONO};font-size:12px;color:${BRAND.muted}">${meta}</div></div>`;
}

export function section(title: string, body: string) {
  return body ? `<div style="margin-top:26px">${label(title)}<div style="margin-top:4px">${body}</div></div>` : "";
}

export function paragraph(text: string) {
  return `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.55;color:${BRAND.ink}">${text}</p>`;
}

export function muted(text: string) {
  return `<p style="margin:0 0 14px;font-family:${SANS};font-size:13px;line-height:1.5;color:${BRAND.muted}">${text}</p>`;
}

export function layout(o: LayoutOptions) {
  const pre = o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(o.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>` : "";
  const links = [
    o.prefsUrl ? `<a href="${esc(o.prefsUrl)}" style="color:${BRAND.muted};text-decoration:underline">Manage email preferences</a>` : "",
    o.unsubscribeUrl ? `<a href="${esc(o.unsubscribeUrl)}" style="color:${BRAND.muted};text-decoration:underline">Unsubscribe</a>` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.ink};-webkit-text-size-adjust:100%">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bg}" style="background:${BRAND.bg}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">
  <tr><td style="padding:0 4px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><a href="${esc(o.siteUrl)}" style="text-decoration:none"><img src="${esc(o.siteUrl)}/brand/wordmark.png" width="96" height="34" alt="UserTrack" style="display:block;width:96px;height:34px;border:0"></a></td>
      <td valign="middle" align="right" style="font-family:${MONO};font-size:11px;letter-spacing:.14em;color:${BRAND.muted}">${esc(o.eyebrow ?? "USERTRACK")}</td>
    </tr></table>
  </td></tr>
  <tr><td bgcolor="${BRAND.card}" style="background:${BRAND.card};border:1px solid ${BRAND.line};border-top:2px solid ${BRAND.pink};padding:28px 24px">
    <h1 style="margin:0 0 14px;font-family:${SANS};font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-.01em;color:${BRAND.ink}">${esc(o.title)}</h1>
    ${o.intro ? paragraph(o.intro) : ""}
    ${o.body ?? ""}
    ${o.cta ? `<div style="margin-top:22px">${button(o.cta.label, o.cta.url)}</div>` : ""}
    ${o.secondary ? `<div style="margin-top:12px;font-family:${SANS};font-size:13px"><a href="${esc(o.secondary.url)}" style="color:${BRAND.muted};text-decoration:underline">${esc(o.secondary.label)}</a></div>` : ""}
  </td></tr>
  <tr><td style="padding:18px 4px 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${BRAND.muted}">
    ${esc(o.footerNote)}
    ${links ? `<div style="margin-top:8px">${links}</div>` : ""}
    <div style="margin-top:10px;font-family:${MONO};font-size:11px;letter-spacing:.1em;color:${BRAND.lineStrong}">USERTRACK · VERIFIED SAAS GROWTH</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Plain-text twin for clients that prefer it and for spam scoring.
export function text(lines: (string | undefined | false)[]) {
  return lines.filter((l): l is string => typeof l === "string" && l.length > 0).join("\n\n");
}
