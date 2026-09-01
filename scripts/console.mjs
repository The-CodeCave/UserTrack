// Prints browser console errors/warnings and failed requests for each URL given.
import { chromium } from "playwright-core";
const urls = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const url of urls) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const msgs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) msgs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => msgs.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("requestfailed", (r) => msgs.push(`reqfail: ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log(`\n== ${url} (${msgs.length})`);
  for (const m of [...new Set(msgs)]) console.log("  ", m);
  await page.close();
}
await browser.close();
