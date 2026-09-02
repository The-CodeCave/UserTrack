// Screenshots of the lifecycle surfaces on a public demo page (desktop + mobile, dark + light). Usage: node scripts/shots-lifecycle.mjs <base> <slug>
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://localhost:3005";
const slug = process.argv[3] ?? "demo-northwind";
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, vp, scheme] of [["d", { width: 1280, height: 900 }, "dark"], ["m", { width: 390, height: 844 }, "dark"]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, colorScheme: scheme });
  await page.goto(`${base}/s/${slug}`);
  await page.waitForSelector("text=Growth", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/tmp/ut-shots/life-${name}-public-full.png`, fullPage: true });
  for (const [id, text] of [["funnel", "Funnel"], ["history", "Rates over time"], ["conversion", "Signup → Converted"], ["cohorts", "Cohorts"]]) {
    const el = page.getByText(text, { exact: true }).first();
    if (!(await el.count())) continue;
    await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
    const panel = el.locator("xpath=ancestor::div[contains(@class,'bg-card')][1]");
    if (!(await panel.count())) continue;
    await panel.screenshot({ path: `/tmp/ut-shots/life-${name}-${id}.png` });
    console.log("✓", name, id);
  }
  await page.goto(`${base}/best-conversion`); await page.waitForTimeout(1200); await page.screenshot({ path: `/tmp/ut-shots/life-${name}-best-conversion.png`, fullPage: false });
  await page.close();
}
await browser.close();
console.log("SHOTS OK");
