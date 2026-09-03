// Usage: node scripts/analytics-check.mjs [base=http://localhost:3100] [out.png]
// Opens a few pages, asserts window.rybbit exists, clicks tracked controls and prints every request to the Rybbit host.
import { chromium } from "playwright-core";

const [base = "http://localhost:3100", out = ""] = process.argv.slice(2);
const host = process.env.NEXT_PUBLIC_RYBBIT_HOST ?? "https://rybbit.internal.thecodecave.de";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const log = [];
page.on("request", (r) => {
  if (!r.url().startsWith(host)) return;
  const body = r.postData();
  let summary = "";
  try {
    const j = JSON.parse(body ?? "{}");
    summary = `${j.type ?? "?"} ${j.event_name ?? ""} ${j.pathname ?? ""} ${j.properties ?? ""} ${j.user_id ? "user=" + j.user_id : ""}`.trim();
  } catch {
    summary = body?.slice(0, 120) ?? "";
  }
  log.push(`${r.method()} ${r.url().replace(host, "")}  ${summary}`);
});

const settle = () => page.waitForTimeout(1500);
await page.goto(`${base}/`, { waitUntil: "networkidle" });
await settle();
const hasRybbit = await page.evaluate(() => typeof window.rybbit?.event === "function");
console.log("window.rybbit present:", hasRybbit);
await page.click("text=See the leaderboard");
await page.waitForURL("**/leaderboard");
await settle();
await page.click("text=7d").catch(() => {});
await settle();
await page.goto(`${base}/discover`, { waitUntil: "networkidle" });
await page.fill("input[aria-label=Search]", "saas");
await settle();
await page.goto(`${base}/developers`, { waitUntil: "networkidle" });
await settle();
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
await settle();

console.log(`\n${log.length} request(s) to ${host}:`);
for (const l of log) console.log("  " + l);
if (out) {
  await page.setContent(`<html><body style="margin:0;background:#0b0c0e;color:#e6e6e6;font:13px/1.6 ui-monospace,Menlo,monospace;padding:32px"><h1 style="font-size:16px;margin:0 0 16px">Rybbit network log — ${base}</h1><div>window.rybbit present: <b>${hasRybbit}</b></div><pre style="white-space:pre-wrap;margin-top:16px">${log.map((l) => l.replace(/</g, "&lt;")).join("\n")}</pre></body></html>`);
  await page.screenshot({ path: out, fullPage: true });
  console.log("saved", out);
}
await browser.close();
if (!hasRybbit) process.exit(1);
