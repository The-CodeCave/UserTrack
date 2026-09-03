import { chromium } from "playwright-core";
// Usage: PORT=3100 pnpm start, then node scripts/shots-legal.mjs
const base = process.env.BASE ?? "http://localhost:3100", out = "docs/screenshots/v1/LEGAL-1";
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const w of [375, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width: w, height: w < 768 ? 812 : 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  for (const p of ["impressum", "privacy", "terms"]) {
    await page.goto(`${base}/${p}`, { waitUntil: "networkidle" }); await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${p}-${w}.png`, fullPage: false });
    if (w === 1440) await page.screenshot({ path: `${out}/${p}-${w}-full.png`, fullPage: true });
  }
  await page.goto(`${base}/`, { waitUntil: "networkidle" }); await page.waitForTimeout(600);
  await page.locator("footer").scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.locator("footer").screenshot({ path: `${out}/footer-public-${w}.png` });
  await page.goto(`${base}/sign-up`, { waitUntil: "networkidle" }); await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/signup-consent-${w}.png`, fullPage: true });
  await page.close();
}
await browser.close(); console.log("done");
